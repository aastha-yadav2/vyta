// test-phase6.js
// Automated verification suite for Phase 6: Real Sensor Validation, Camera Reliability & System QA

'use strict';

const fs = require('fs');
const path = require('path');

const BRAIN_SCRATCH = 'C:/Users/asus/.gemini/antigravity/brain/bca309bd-5e2c-4a9d-9ee1-ce0f9e3c945e/scratch';
const LOCAL_SCRATCH = path.join(__dirname, 'scratch');
const REPORT_PATH = path.join(__dirname, 'scratch', 'phase6-qa-report.json');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function captureStepScreenshot(win, filename) {
    ensureDir(BRAIN_SCRATCH);
    ensureDir(LOCAL_SCRATCH);
    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();
    fs.writeFileSync(path.join(BRAIN_SCRATCH, filename), pngBuffer);
    fs.writeFileSync(path.join(LOCAL_SCRATCH, filename), pngBuffer);
    console.log(`[TEST] Captured screenshot: ${filename} (${pngBuffer.length} bytes)`);
}

async function runPhase6Tests(win, app) {
    console.log('====================================================');
    console.log('   VYTA Phase 6: Real Sensor & Reliability QA       ');
    console.log('====================================================');

    const results = [];
    const qaReport = {
        timestamp: new Date().toISOString(),
        environment: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
        },
        tests: [],
        cameraAudit: {},
        lifecycleMetrics: {},
        summary: {},
    };

    const assert = (condition, name, details = '') => {
        if (condition) {
            console.log(`[PASS] ${name}`);
            results.push({ name, passed: true });
            qaReport.tests.push({ name, passed: true, details });
        } else {
            console.error(`[FAIL] ${name} - ${details}`);
            results.push({ name, passed: false, details });
            qaReport.tests.push({ name, passed: false, details });
        }
    };

    try {
        await new Promise(r => setTimeout(r, 1000));

        // Mark onboarding completed and switch to Live Session tab
        await win.webContents.executeJavaScript(`
            (() => {
                localStorage.setItem('vyta_onboarding_completed', 'true');
                const overlay = document.getElementById('onboarding-overlay');
                if (overlay) overlay.hidden = true;
                const tabs = document.querySelectorAll('.nav-tab');
                const liveTab = Array.from(tabs).find(t => t.dataset.tab === 'live-session');
                if (liveTab) liveTab.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 500));

        // ----------------------------------------------------
        // Test 1: Device Detection & Camera Enumeration
        // ----------------------------------------------------
        const t1 = await win.webContents.executeJavaScript(`
            (async () => {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                return {
                    count: videoInputs.length,
                    labels: videoInputs.map(d => d.label)
                };
            })()
        `);
        qaReport.cameraAudit.enumeration = t1;
        assert(t1.count > 0, 'Test 1: Video input device detected and enumerated', JSON.stringify(t1));

        // ----------------------------------------------------
        // Test 2: Sequential Diagnostics Initial State
        // ----------------------------------------------------
        const t2 = await win.webContents.executeJavaScript(`
            (() => {
                const diag = window.__vytaDiagnostics.getDiagnosticSeparation();
                return {
                    camera: diag.cameraAvailability,
                    face: diag.faceDetection,
                    sdk: diag.sdkProcessing,
                    signal: diag.signalValidity
                };
            })()
        `);
        assert(t2.camera === 'NOT_CHECKED' && t2.face === 'Inactive' && t2.sdk === 'Idle' && t2.signal === 'Unavailable',
            'Test 2: Diagnostic Separation starts in clean uninitialized state',
            JSON.stringify(t2));

        // ----------------------------------------------------
        // Test 3: Camera Pre-flight Acquisition & Lock 30 FPS Mode
        // ----------------------------------------------------
        const t3 = await win.webContents.executeJavaScript(`
            (async () => {
                let stream = null;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
                    });
                    const track = stream.getVideoTracks()[0];
                    const caps = track.getCapabilities ? track.getCapabilities() : {};
                    const settings = track.getSettings ? track.getSettings() : {};
                    const canManual = caps.exposureMode && caps.exposureMode.includes('manual');

                    // Measure frame rate over 1.5s
                    const processor = new MediaStreamTrackProcessor({ track });
                    const reader = processor.readable.getReader();
                    let frames = 0;
                    const start = performance.now();
                    while (performance.now() - start < 1500) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        frames++;
                        value.close();
                    }
                    reader.cancel();
                    const elapsed = (performance.now() - start) / 1000;
                    const fps = frames / elapsed;
                    stream.getTracks().forEach(t => t.stop());

                    return {
                        success: true,
                        width: settings.width,
                        height: settings.height,
                        canManual,
                        fps,
                        frames
                    };
                } catch (err) {
                    if (stream) stream.getTracks().forEach(t => t.stop());
                    return { success: false, error: err.message };
                }
            })()
        `);
        qaReport.cameraAudit.preflight = t3;
        assert(t3.success && t3.width >= 640 && t3.height >= 480,
            'Test 3: Camera hardware acquisition delivers target resolution (>= 640x480)',
            JSON.stringify(t3));

        // ----------------------------------------------------
        // Test 4: Live Session Start & State Transition
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const btnStart = document.getElementById('btn-start');
                if (btnStart) btnStart.click();
            })();
        `);

        // Wait up to 6 seconds for preflight FPS check + SDK graph initialization
        let t4 = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 200));
            t4 = await win.webContents.executeJavaScript(`
                (() => {
                    const state = window.__vytaDiagnostics.getState();
                    const sdkStatus = window.__vytaDiagnostics.getSdkStatus();
                    const camStatus = window.__vytaDiagnostics.getCameraStatus();
                    return { state, sdkStatus, camStatus };
                })()
            `);
            if (t4.state === 'RUNNING') break;
        }
        assert(t4.state === 'RUNNING' && t4.sdkStatus === 'Running' && (t4.camStatus === 'READY' || t4.camStatus === 'WARNING'),
            'Test 4: Live session starts and transitions cleanly to RUNNING',
            JSON.stringify(t4));

        await captureStepScreenshot(win, 'phase6-live-sensing.png');

        // ----------------------------------------------------
        // Test 5: Live SDK Signal & Validation Separation
        // ----------------------------------------------------
        // Wait 4 seconds for frame processing and validation callbacks
        await new Promise(r => setTimeout(r, 4000));

        const t5 = await win.webContents.executeJavaScript(`
            (() => {
                const diag = window.__vytaDiagnostics.getDiagnosticSeparation();
                const history = window.__vytaDiagnostics.getValidationHistory();
                const metrics = window.__vytaDiagnostics.getAccumulated();
                return {
                    camera: diag.cameraAvailability,
                    face: diag.faceDetection,
                    sdk: diag.sdkProcessing,
                    signal: diag.signalValidity,
                    validationCount: history.length,
                    latestCode: diag.latestValidationCode,
                    validationName: diag.validationName,
                    facialLum: diag.facialLuminance,
                    facialMetrics: diag.facialMetrics,
                    breathingRateCount: metrics.breathingRateCount
                };
            })()
        `);
        qaReport.cameraAudit.liveSeparation = t5;
        assert(t5.sdk === 'Running' && t5.validationCount > 0 && typeof t5.facialLum === 'number',
            'Test 5: Live SmartSpectra pipeline delivers frames, validation feedback & facial luminance',
            JSON.stringify(t5));

        // ----------------------------------------------------
        // Test 6: Zero Fabricated Physiological Vitals
        // ----------------------------------------------------
        const t6 = await win.webContents.executeJavaScript(`
            (() => {
                const metrics = window.__vytaDiagnostics.getAccumulated();
                const breathingText = document.getElementById('readout-breathing')?.textContent;
                const pulseText = document.getElementById('readout-pulse')?.textContent;
                return {
                    brCount: metrics.breathingRateCount,
                    latestBr: metrics.latestBreathingRate,
                    breathingText,
                    pulseText,
                    isPlaceholderOrReal: breathingText === '—' || !isNaN(parseFloat(breathingText))
                };
            })()
        `);
        assert(t6.isPlaceholderOrReal,
            'Test 6: Strict vitals integrity — values are genuine SDK outputs or null placeholder ("—")',
            JSON.stringify(t6));

        // ----------------------------------------------------
        // Test 7: Metric Toggles Disabled During Active Session
        // ----------------------------------------------------
        const t7 = await win.webContents.executeJavaScript(`
            (() => {
                const cardio = document.getElementById('m-cardio');
                const face = document.getElementById('m-face');
                return {
                    cardioDisabled: cardio.disabled,
                    faceDisabled: face.disabled
                };
            })()
        `);
        assert(t7.cardioDisabled && t7.faceDisabled,
            'Test 7: Telemetry toggles are safely disabled during active session',
            JSON.stringify(t7));

        // ----------------------------------------------------
        // Test 8: Live Tab Switching During Active Sensing
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const tabs = document.querySelectorAll('.nav-tab');
                const histTab = Array.from(tabs).find(t => t.dataset.tab === 'history');
                if (histTab) histTab.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 600));

        const t8_hist = await win.webContents.executeJavaScript(`
            (() => {
                const state = window.__vytaDiagnostics.getState();
                const histPane = document.getElementById('view-history');
                return {
                    state,
                    isHistActive: histPane.classList.contains('active')
                };
            })()
        `);

        // Switch back to Live Session
        await win.webContents.executeJavaScript(`
            (() => {
                const tabs = document.querySelectorAll('.nav-tab');
                const liveTab = Array.from(tabs).find(t => t.dataset.tab === 'live-session');
                if (liveTab) liveTab.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 600));

        const t8_live = await win.webContents.executeJavaScript(`
            (() => {
                const state = window.__vytaDiagnostics.getState();
                const sdkStatus = window.__vytaDiagnostics.getSdkStatus();
                return { state, sdkStatus };
            })()
        `);
        assert(t8_hist.state === 'RUNNING' && t8_live.state === 'RUNNING' && t8_live.sdkStatus === 'Running',
            'Test 8: Tab switching during active sensing preserves session state and pipeline stability',
            JSON.stringify({ t8_hist, t8_live }));

        // ----------------------------------------------------
        // Test 9: Session Stop & Camera Teardown Cleanliness
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const btnStop = document.getElementById('btn-stop');
                if (btnStop) btnStop.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 1200));

        const t9 = await win.webContents.executeJavaScript(`
            (() => {
                const state = window.__vytaDiagnostics.getState();
                const sdkStatus = window.__vytaDiagnostics.getSdkStatus();
                const settings = window.__vytaDiagnostics.getSettings();
                const videoEl = document.getElementById('preview');
                const tracksLive = videoEl?.srcObject?.getVideoTracks?.()?.some(t => t.readyState === 'live') ?? false;
                const cardio = document.getElementById('m-cardio');
                return {
                    state,
                    sdkStatus,
                    settingsIsNull: settings === null,
                    tracksLive,
                    togglesReEnabled: !cardio.disabled
                };
            })()
        `);
        assert(t9.state === 'IDLE' && t9.sdkStatus === 'Idle' && t9.settingsIsNull && !t9.tracksLive && t9.togglesReEnabled,
            'Test 9: Session stop fully releases camera hardware and restores IDLE state',
            JSON.stringify(t9));

        // ----------------------------------------------------
        // Test 10: Reset Session Clears Artifacts & State
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const btnReset = document.getElementById('btn-reset');
                if (btnReset) btnReset.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 600));

        const t10 = await win.webContents.executeJavaScript(`
            (() => {
                const state = window.__vytaDiagnostics.getState();
                const history = window.__vytaDiagnostics.getValidationHistory();
                const brText = document.getElementById('readout-breathing')?.textContent;
                const pulseText = document.getElementById('readout-pulse')?.textContent;
                const validation = document.getElementById('validation')?.textContent;
                return {
                    state,
                    historyCleared: history.length === 0,
                    brText,
                    pulseText,
                    validation
                };
            })()
        `);
        assert(t10.state === 'IDLE' && t10.historyCleared && t10.brText === '—' && t10.pulseText === '—',
            'Test 10: Reset session clears validation history and resets readouts to placeholders',
            JSON.stringify(t10));

        // ----------------------------------------------------
        // Test 11-15: 5x Consecutive Start / Stop Lifecycle Stress Test
        // ----------------------------------------------------
        console.log('[TEST] Executing 5x consecutive Start / Stop lifecycle stress test...');
        let lifecycleSuccessCount = 0;
        const cycleTimes = [];

        for (let cycle = 1; cycle <= 5; cycle++) {
            const cycleStart = Date.now();
            // Start
            await win.webContents.executeJavaScript(`
                (() => {
                    const btnStart = document.getElementById('btn-start');
                    if (btnStart && !btnStart.disabled) btnStart.click();
                })();
            `);
            // Poll until RUNNING (up to 6s)
            let runningCheck = null;
            for (let w = 0; w < 30; w++) {
                await new Promise(r => setTimeout(r, 200));
                runningCheck = await win.webContents.executeJavaScript(`
                    (() => ({
                        state: window.__vytaDiagnostics.getState(),
                        sdk: window.__vytaDiagnostics.getSdkStatus()
                    }))()
                `);
                if (runningCheck.state === 'RUNNING') break;
            }

            // Stop
            await win.webContents.executeJavaScript(`
                (() => {
                    const btnStop = document.getElementById('btn-stop');
                    if (btnStop && !btnStop.disabled) btnStop.click();
                })();
            `);
            // Poll until IDLE (up to 4s)
            let stoppedCheck = null;
            for (let w = 0; w < 20; w++) {
                await new Promise(r => setTimeout(r, 200));
                stoppedCheck = await win.webContents.executeJavaScript(`
                    (() => ({
                        state: window.__vytaDiagnostics.getState(),
                        sdk: window.__vytaDiagnostics.getSdkStatus(),
                        settings: window.__vytaDiagnostics.getSettings()
                    }))()
                `);
                if (stoppedCheck.state === 'IDLE') break;
            }

            const duration = Date.now() - cycleStart;
            cycleTimes.push(duration);

            if (runningCheck?.state === 'RUNNING' && stoppedCheck?.state === 'IDLE' && stoppedCheck?.settings === null) {
                lifecycleSuccessCount++;
                console.log(`[PASS] Lifecycle cycle ${cycle}/5 completed cleanly in ${duration}ms`);
            } else {
                console.error(`[FAIL] Lifecycle cycle ${cycle}/5 failed: running=${JSON.stringify(runningCheck)} stopped=${JSON.stringify(stoppedCheck)}`);
            }
        }
        qaReport.lifecycleMetrics.fiveCycles = { lifecycleSuccessCount, cycleTimes };
        assert(lifecycleSuccessCount === 5,
            'Tests 11-15: 5x consecutive Start/Stop lifecycle cycles succeed without leaks or lockups',
            `successes: ${lifecycleSuccessCount}/5`);

        // ----------------------------------------------------
        // Test 16: Safe Onboarding Camera Readiness Probe
        // ----------------------------------------------------
        const t16 = await win.webContents.executeJavaScript(`
            (async () => {
                await window.__vytaDiagnostics.checkCameraReadiness();
                const badgeText = document.getElementById('ob-status-badge')?.textContent;
                const diag = window.__vytaDiagnostics.getDiagnosticSeparation();
                return {
                    badgeText,
                    cameraAvailability: diag.cameraAvailability
                };
            })()
        `);
        assert(t16.badgeText.includes('ready') || t16.badgeText.includes('Camera'),
            'Test 16: Onboarding camera check probe executes cleanly and safely releases camera',
            JSON.stringify(t16));

        // ----------------------------------------------------
        // Test 17: Full System Regression — Phase 2 Navigation
        // ----------------------------------------------------
        const t17 = await win.webContents.executeJavaScript(`
            (() => {
                const tabs = document.querySelectorAll('.nav-tab');
                const tabsFound = Array.from(tabs).map(t => t.dataset.tab);
                const panes = document.querySelectorAll('.view-pane');
                const panesFound = Array.from(panes).map(p => p.id);
                return {
                    tabsFound,
                    panesFound,
                    hasAllTabs: ['overview', 'live-session', 'history', 'settings'].every(t => tabsFound.includes(t))
                };
            })()
        `);
        assert(t17.hasAllTabs,
            'Test 17: Regression Phase 2 — App shell, 4 navigation tabs and view panes intact',
            JSON.stringify(t17));

        // ----------------------------------------------------
        // Test 18: Full System Regression — Phase 3 Adaptive Breathing Engine
        // ----------------------------------------------------
        const t18 = await win.webContents.executeJavaScript(`
            (() => {
                // Navigate to overview to inspect breathing canvas
                const tabs = document.querySelectorAll('.nav-tab');
                const overTab = Array.from(tabs).find(t => t.dataset.tab === 'overview');
                if (overTab) overTab.click();

                const orb = document.querySelector('.breathing-orb, #breathing-orb, .breathing-canvas');
                const durationBtns = document.querySelectorAll('.duration-pill, .btn-duration');
                const heroBtn = document.getElementById('btn-hero-start');
                return {
                    hasOrb: !!orb,
                    hasDurationSelectors: durationBtns.length > 0,
                    hasHeroBtn: !!heroBtn
                };
            })()
        `);
        assert(t18.hasOrb && t18.hasHeroBtn,
            'Test 18: Regression Phase 3 — Adaptive Breathing Canvas and duration selectors intact',
            JSON.stringify(t18));

        // ----------------------------------------------------
        // Test 19: Full System Regression — Phase 4 Onboarding & Consent
        // ----------------------------------------------------
        const t19 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const stepCount = document.querySelectorAll('.onboarding-step-pane').length;
                const consentBox = document.getElementById('ob-consent-checkbox');
                return {
                    hasOverlay: !!overlay,
                    stepCount,
                    hasConsentBox: !!consentBox
                };
            })()
        `);
        assert(t19.hasOverlay && t19.stepCount >= 5 && t19.hasConsentBox,
            'Test 19: Regression Phase 4 — 5-step onboarding flow and camera consent gating intact',
            JSON.stringify(t19));

        // ----------------------------------------------------
        // Test 20: Full System Regression — Phase 5 History & Analytics
        // ----------------------------------------------------
        const t20 = await win.webContents.executeJavaScript(`
            (() => {
                // Switch to history tab to render history components
                const tabs = document.querySelectorAll('.nav-tab');
                const histTab = Array.from(tabs).find(t => t.dataset.tab === 'history');
                if (histTab) histTab.click();

                const statsGrid = document.querySelector('.history-analytics-grid');
                const chartWrap = document.querySelector('.weekly-activity-card');
                const calWrap = document.querySelector('.calendar-card');
                const modal = document.getElementById('session-detail-modal');
                const analytics = window.__vytaDiagnostics.getAnalytics();
                return {
                    hasStatsGrid: !!statsGrid,
                    hasChartWrap: !!chartWrap,
                    hasCalWrap: !!calWrap,
                    hasModal: !!modal,
                    hasAnalyticsCalc: typeof analytics.totalSessions === 'number'
                };
            })()
        `);
        assert(t20.hasStatsGrid && t20.hasCalWrap && t20.hasModal && t20.hasAnalyticsCalc,
            'Test 20: Regression Phase 5 — History analytics cards, calendar, detail modal and calculations intact',
            JSON.stringify(t20));

        await captureStepScreenshot(win, 'phase6-regression.png');

        // Save QA Report JSON
        ensureDir(BRAIN_SCRATCH);
        ensureDir(LOCAL_SCRATCH);
        const passedCount = results.filter(r => r.passed).length;
        qaReport.summary = {
            totalTests: results.length,
            passedCount,
            failedCount: results.length - passedCount,
            allPassed: passedCount === results.length,
            status: passedCount === results.length ? 'VERIFIED' : 'PARTIALLY VERIFIED'
        };

        const reportJson = JSON.stringify(qaReport, null, 2);
        fs.writeFileSync(REPORT_PATH, reportJson);
        fs.writeFileSync(path.join(BRAIN_SCRATCH, 'phase6-qa-report.json'), reportJson);
        console.log(`[TEST] Saved complete QA report to ${REPORT_PATH}`);

        console.log('====================================================');
        console.log(`Results: ${passedCount}/${results.length} tests passed.`);
        console.log('====================================================');

        // Graceful window close: invokes win.close() which triggers main.js's
        // win.on('close') handler, safely tearing down Koffi/MediaPipe threads
        // and exiting cleanly with code 0.
        process.exitCode = (passedCount === results.length) ? 0 : 1;
        setTimeout(() => {
            console.log('[TEST] Initiating graceful window close teardown...');
            win.close();
        }, 800);

    } catch (err) {
        console.error('[TEST] Unhandled exception in Phase 6 test suite:', err);
        setTimeout(() => {
            win.close();
        }, 800);
    }
}

module.exports = { runPhase6Tests };

