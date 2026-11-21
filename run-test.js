// run-test.js
// Cross-platform test launcher for VYTA automated test suites.
// Supports: node run-test.js [4 | 5 | 6 | baseline]

'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const electron = require('electron');

const suite = process.argv[2] || '6';

// 1. Ensure the renderer bundle is built
try {
    execSync('node build.js', { stdio: 'inherit', cwd: __dirname });
} catch (err) {
    console.error('[run-test] Build step failed prior to test launch.');
    process.exit(1);
}

// 2. Launch Electron with the targeted test suite
console.log(`[run-test] Launching VYTA test suite: Phase ${suite}...`);
const env = { ...process.env, VYTA_RUN_TESTS: suite };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], {
    stdio: 'inherit',
    env,
    cwd: __dirname,
    shell: false,
});

child.on('close', (code) => {
    console.log(`[run-test] Test run exited with code ${code ?? 0}`);
    process.exit(code ?? 0);
});

child.on('error', (err) => {
    console.error('[run-test] Failed to spawn Electron process:', err);
    process.exit(1);
});
