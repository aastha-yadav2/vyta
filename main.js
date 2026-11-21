// main.js
// Copyright (C) 2026 Presage Technologies, Inc.
//
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// Main-process entry point for the SmartSpectra Electron quickstart.
//
// Responsibilities:
//   1. Spawn a BrowserWindow that hosts the renderer-side SDK.
//   2. Wire the IPC channel that the renderer uses to talk to the
//      main-process SDK (via bindSmartSpectraIpc).
//   3. Auto-allow camera permission for the sample window so the user is
//      prompted by the OS once (macOS) or implicitly (Windows / Linux).

'use strict';

const path = require('path');
const { app, BrowserWindow, session } = require('electron');

// In a packaged build the native runtime closure is delivered as an extra
// resource at `resources/smartspectra/` (see package.json#build.extraResources),
// NOT inside app.asar — a .dylib/.dll/.so cannot be dlopen'd from within an asar
// archive. Point the binding's resolver at that unpacked copy BEFORE requiring
// the binding (the require triggers the native load). During `npm start` (not
// packaged) this is skipped and the resolver uses the per-platform package or
// the SMARTSPECTRA_CAPI_PATH you exported in your shell.
// Note: this honors a pre-set SMARTSPECTRA_CAPI_PATH even in a packaged build,
// so the bundled-resource path is the default but not forced. That's the
// binding's deliberate dev/override escape hatch. A production app that doesn't
// want its native library redirectable via the environment should set the
// bundled resource path UNCONDITIONALLY (drop the `!process.env...` guard).
if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
    const LIB = {
        darwin: 'libsmartspectra_capi.dylib',
        win32:  'smartspectra_capi.dll',
        linux:  'libsmartspectra_capi.so',
    }[process.platform];
    if (LIB) {
        process.env.SMARTSPECTRA_CAPI_PATH =
            path.join(process.resourcesPath, 'smartspectra', LIB);
    } else {
        // We shouldn't get here — electron-builder is configured only for the
        // platforms above. Flag it clearly so the imminent resolver failure
        // reads as "this packaged build has no resource layout for <platform>"
        // rather than the generic missing-platform-package message.
        console.error(
            `[smartspectra] packaged build on unsupported platform "${process.platform}" — ` +
            `no resources/smartspectra/ layout for it; the native binding will fail to load.`);
    }
}

const { bindSmartSpectraIpc, awaitSessionTeardown } = require('@smartspectra/node-sdk/main');

// Verbose IPC logging + auto-opened DevTools are opt-in via the
// `SMARTSPECTRA_DIAGNOSTICS=1` env var. A regular `npm start` launches
// a clean production-style window; pass the env var when debugging the
// frame pump or graph wiring (e.g. `SMARTSPECTRA_DIAGNOSTICS=1 npm start`).
const DIAGNOSTICS = process.env.SMARTSPECTRA_DIAGNOSTICS === '1';

let isShuttingDown = false;
let appIsQuitting = false;

function createWindow() {
    const win = new BrowserWindow({
        title: 'VYTA — Your Body. Your Rhythm.',
        width: 1200,
        height: 820,
        minWidth: 1040,
        minHeight: 720,
        backgroundColor: '#070a09',
        webPreferences: {
            // Point the BrowserWindow at the package's preload bridge so
            // the renderer's SmartSpectraSDK can talk to this main process.
            // The preload runs in its own isolated world and exposes a
            // tightly-scoped `window.__smartspectraBridge` to the renderer.
            preload: require.resolve('@smartspectra/node-sdk/preload'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    bindSmartSpectraIpc(win);

    win.webContents.on('console-message', (_event, level, message) => {
        console.log(`[renderer] ${message}`);
    });

    // Authoritative graceful window close handler:
    // Prevents abrupt V8 isolate destruction while native MediaPipe / Koffi worker
    // threads are in flight, eliminating N-API fatal errors during shutdown.
    win.on('close', async (event) => {
        if (isShuttingDown) return;
        event.preventDefault();
        isShuttingDown = true;
        if (DIAGNOSTICS) {
            console.log('[main] Window close intercepted: initiating graceful SDK session teardown...');
        }

        try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                await win.webContents.executeJavaScript(`
                    window.__vytaGracefulShutdown ? window.__vytaGracefulShutdown() : Promise.resolve()
                `).catch(() => {});
            }
        } catch (err) {
            console.warn('[main] Error invoking renderer graceful shutdown:', err);
        }

        // Await the native C++ Koffi teardown barrier to join all worker threads
        if (typeof awaitSessionTeardown === 'function') {
            try { await awaitSessionTeardown(); } catch {}
        }
        // Brief drain for any trailing libuv callbacks
        await new Promise((r) => setTimeout(r, 200));

        win.destroy();
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    // A quickstart only ever renders its own bundled page. Block popups and
    // navigation away from it so a copied-and-extended app can't be steered to
    // remote content that would inherit this window's camera grant.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    if (process.env.VYTA_RUN_TESTS) {
        win.webContents.once('did-finish-load', () => {
            if (process.env.VYTA_RUN_TESTS === '4') {
                const { runPhase4Tests } = require('./test-phase4');
                runPhase4Tests(win, app);
            } else if (process.env.VYTA_RUN_TESTS === '5') {
                const { runPhase5Tests } = require('./test-phase5');
                runPhase5Tests(win, app);
            } else if (process.env.VYTA_RUN_TESTS === '6') {
                const { runPhase6Tests } = require('./test-phase6');
                runPhase6Tests(win, app);
            } else if (process.env.VYTA_RUN_TESTS === 'baseline') {
                const { runBaselineAudit } = require('./scratch/run-baseline-audit');
                runBaselineAudit(win, app);
            } else {
                const { runPhase5Tests } = require('./test-phase5');
                runPhase5Tests(win, app);
            }
        });
    }

    win.loadFile(path.join(__dirname, 'index.html'));

    if (DIAGNOSTICS) {
        // Opt-in via SMARTSPECTRA_DIAGNOSTICS=1 so the renderer-side
        // `console` output (frame pump diagnostics, validation /
        // processing status traces) is visible without extra setup.
        // Silent by default so a casual `npm start` looks production-like.
        win.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(() => {
    // Allow the renderer's `getUserMedia({ video: true })` call without an
    // extra in-page prompt. The OS-level camera prompt (macOS) and
    // indicator LED still fire normally. Grant ONLY the camera and ONLY to
    // the bundled local page — deny everything else so a copied app that
    // later loads remote content doesn't auto-grant the camera.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
        // Electron's 'media' permission covers camera AND microphone. The
        // quickstart only needs the camera (the SDK calls
        // getUserMedia({ video: ... }) with no audio), so require a video-only
        // request and deny anything that also asks for the mic — don't hand a
        // copied sample a broader grant than it uses.
        const mediaTypes = (details && details.mediaTypes) || [];
        const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video';
        callback(permission === 'media' && cameraOnly && url.startsWith('file://'));
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', (e) => {
    if (!appIsQuitting) {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            e.preventDefault();
            appIsQuitting = true;
            windows[0].close();
        }
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
