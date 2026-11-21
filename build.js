// build.js
// Local build configuration for VYTA SmartSpectra Electron quickstart.
// Bundles renderer.js with esbuild and injects environment variables.

'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// Load local .env using Node.js built-in environment-file support (Node 20.6+ / 21.7+)
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === 'function') {
        try {
            process.loadEnvFile(envPath);
        } catch (err) {
            console.warn(`[build] Warning: Could not parse .env file (${err.message})`);
        }
    }
}

// Read SMARTSPECTRA_API_KEY from environment.
// Security requirement: Never print or log the API key value.
const apiKey = process.env.SMARTSPECTRA_API_KEY || '';

async function runBuild() {
    try {
        await esbuild.build({
            entryPoints: [path.resolve(__dirname, 'renderer.js')],
            bundle: true,
            outfile: path.resolve(__dirname, 'dist/renderer.bundle.js'),
            platform: 'browser',
            format: 'iife',
            logLevel: 'warning',
            define: {
                '__SMARTSPECTRA_API_KEY__': JSON.stringify(apiKey),
            },
        });
        console.log('[build] Bundle generated successfully at dist/renderer.bundle.js');
    } catch (err) {
        console.error('[build] Build failed.');
        process.exit(1);
    }
}

runBuild();

