// test-phase4.js
// Automated verification suite for Phase 4: Onboarding, Consent & First-Run Experience

'use strict';

const fs = require('fs');
const path = require('path');

const BRAIN_SCRATCH = 'C:/Users/asus/.gemini/antigravity/brain/bca309bd-5e2c-4a9d-9ee1-ce0f9e3c945e/scratch';
const LOCAL_SCRATCH = path.join(__dirname, 'scratch');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
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

async function runPhase4Tests(win, app) {
    console.log('====================================================');
    console.log('   VYTA Phase 4: Onboarding & Consent Test Suite    ');
    console.log('====================================================');

    const results = [];
    const assert = (condition, name, details = '') => {
        if (condition) {
            console.log(`[PASS] ${name}`);
            results.push({ name, passed: true });
        } else {
            console.error(`[FAIL] ${name} - ${details}`);
            results.push({ name, passed: false, details });
        }
    };

    try {
        // Wait 800ms for renderer DOM and scripts to settle
        await new Promise(r => setTimeout(r, 800));

        // Step 0: Ensure fresh first-run state
        await win.webContents.executeJavaScript(`
            localStorage.removeItem('vyta_onboarding_completed');
            localStorage.removeItem('vyta_onboarding_consent');
            window.__vytaDiagnostics.resetOnboarding();
        `);
        await new Promise(r => setTimeout(r, 300));

        // ----------------------------------------------------
        // Test 1: Welcome Screen Display
        // ----------------------------------------------------
        const t1 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const step1 = document.getElementById('ob-step-1');
                const title = step1 ? step1.querySelector('.ob-title')?.textContent : '';
                const brand = overlay ? overlay.querySelector('.brand-name')?.textContent : '';
                const btnNext = document.getElementById('btn-ob-welcome-next');
                const btnSkip = document.getElementById('btn-ob-welcome-skip');
                return {
                    visible: !overlay.hidden,
                    step1Active: step1?.classList.contains('active'),
                    title,
                    brand,
                    hasNext: !!btnNext,
                    hasSkip: !!btnSkip
                };
            })()
        `);
        assert(t1.visible && t1.step1Active && t1.brand === 'VYTA' && t1.title === 'Find your rhythm.',
            'Test 1: First-Launch Welcome Screen Display',
            JSON.stringify(t1));

        await captureStepScreenshot(win, 'phase4-onboarding-welcome.png');

        // ----------------------------------------------------
        // Test 2: Welcome CTA Advance
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-welcome-next').click();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t2 = await win.webContents.executeJavaScript(`
            (() => {
                const step = window.__vytaDiagnostics.getOnboardingStep();
                const step2 = document.getElementById('ob-step-2');
                const indicator = document.getElementById('ob-step-indicator-text')?.textContent;
                return { step, step2Active: step2?.classList.contains('active'), indicator };
            })()
        `);
        assert(t2.step === 2 && t2.step2Active && t2.indicator === 'Step 2 of 5',
            'Test 2: Welcome CTA Advance to Step 2',
            JSON.stringify(t2));

        // ----------------------------------------------------
        // Test 3: Back Navigation
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-back').click();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t3 = await win.webContents.executeJavaScript(`
            (() => {
                const step = window.__vytaDiagnostics.getOnboardingStep();
                const btnBack = document.getElementById('btn-ob-back');
                return { step, backHidden: btnBack.hidden };
            })()
        `);
        assert(t3.step === 1 && t3.backHidden,
            'Test 3: Back Navigation and Back button visibility',
            JSON.stringify(t3));

        // Advance back to Step 2 for screenshot and tests
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-welcome-next').click();
        `);
        await new Promise(r => setTimeout(r, 300));
        await captureStepScreenshot(win, 'phase4-onboarding-howitworks.png');

        // ----------------------------------------------------
        // Test 4: How It Works Educational Steps & Disclaimer
        // ----------------------------------------------------
        const t4 = await win.webContents.executeJavaScript(`
            (() => {
                const cards = document.querySelectorAll('#ob-step-2 .ob-card');
                const notice = document.querySelector('#ob-step-2 .ob-notice-banner')?.textContent;
                return {
                    cardsCount: cards.length,
                    hasNotice: !!notice && notice.includes('No Guaranteed Measurements')
                };
            })()
        `);
        assert(t4.cardsCount === 3 && t4.hasNotice,
            'Test 4: How Contactless Sensing Works (3 steps + optical notice)',
            JSON.stringify(t4));

        // ----------------------------------------------------
        // Advance to Step 3: Privacy & Informed Consent
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-next').click();
        `);
        await new Promise(r => setTimeout(r, 300));
        await captureStepScreenshot(win, 'phase4-onboarding-privacy.png');

        // ----------------------------------------------------
        // Test 5: Privacy Disclosures
        // ----------------------------------------------------
        const t5 = await win.webContents.executeJavaScript(`
            (() => {
                const items = document.querySelectorAll('#ob-step-3 .ob-privacy-item');
                const text = document.getElementById('ob-step-3')?.textContent || '';
                return {
                    itemCount: items.length,
                    hasOnDevice: text.includes('100% On-Device Processing'),
                    hasSessionPower: text.includes('Session-Based Camera Power'),
                    hasLocalHistory: text.includes('Minimal Local-Only History'),
                    hasUserControl: text.includes('Complete User Control')
                };
            })()
        `);
        assert(t5.itemCount === 4 && t5.hasOnDevice && t5.hasSessionPower && t5.hasLocalHistory && t5.hasUserControl,
            'Test 5: Privacy & Informed Consent Disclosures (4 core pillars)',
            JSON.stringify(t5));

        // ----------------------------------------------------
        // Test 6: Consent Gating - Disabled when unchecked
        // ----------------------------------------------------
        const t6 = await win.webContents.executeJavaScript(`
            (() => {
                const checkbox = document.getElementById('ob-consent-checkbox');
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change'));
                const btnNext = document.getElementById('btn-ob-next');
                return { checked: checkbox.checked, disabled: btnNext.disabled };
            })()
        `);
        assert(!t6.checked && t6.disabled,
            'Test 6: Consent Gating (Continue button disabled when unchecked)',
            JSON.stringify(t6));

        // Try clicking disabled next button -> step should remain 3
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-next').click();
        `);
        await new Promise(r => setTimeout(r, 200));
        const t6Stay = await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.getOnboardingStep();
        `);
        assert(t6Stay === 3, 'Test 7: Disabled Continue button prevents advance past Step 3');

        // ----------------------------------------------------
        // Test 8: Consent Gating - Enabled when checked
        // ----------------------------------------------------
        const t8 = await win.webContents.executeJavaScript(`
            (() => {
                const checkbox = document.getElementById('ob-consent-checkbox');
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change'));
                const btnNext = document.getElementById('btn-ob-next');
                return { checked: checkbox.checked, disabled: btnNext.disabled };
            })()
        `);
        assert(t8.checked && !t8.disabled,
            'Test 8: Consent Gating (Continue button enabled when checked)',
            JSON.stringify(t8));

        // ----------------------------------------------------
        // Test 9: Review Privacy Settings Link
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-review-privacy').click();
        `);
        await new Promise(r => setTimeout(r, 300));
        const t9 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const settingsPane = document.getElementById('view-settings');
                return {
                    overlayHidden: overlay.hidden,
                    settingsActive: settingsPane.classList.contains('active')
                };
            })()
        `);
        assert(t9.overlayHidden && t9.settingsActive,
            'Test 9: Review Privacy Settings Link switches to Settings pane',
            JSON.stringify(t9));

        // Return to Onboarding Step 4
        await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.setOnboardingStep(4);
            document.getElementById('onboarding-overlay').hidden = false;
        `);
        await new Promise(r => setTimeout(r, 300));
        await captureStepScreenshot(win, 'phase4-onboarding-setup.png');

        // ----------------------------------------------------
        // Test 10: Camera Setup Guidance Graphic & Checklist
        // ----------------------------------------------------
        const t10 = await win.webContents.executeJavaScript(`
            (() => {
                const frame = document.querySelector('#ob-step-4 .ob-placement-frame');
                const silhouette = document.querySelector('#ob-step-4 .ob-face-silhouette');
                const disclaimer = document.querySelector('#ob-step-4 .ob-placement-disclaimer')?.textContent;
                const checklistRows = document.querySelectorAll('#ob-step-4 .ob-guide-row');
                const guideText = document.getElementById('ob-step-4')?.textContent || '';
                return {
                    hasFrame: !!frame,
                    hasSilhouette: !!silhouette,
                    hasDisclaimer: !!disclaimer && disclaimer.includes('Not an active facial scan'),
                    checklistCount: checklistRows.length,
                    hasDistance: guideText.includes('Distance (~18–36 inches)'),
                    hasLight: guideText.includes('Even Frontal Light'),
                    hasVisibility: guideText.includes('Clear Visibility'),
                    hasStillness: guideText.includes('Relaxed Stillness')
                };
            })()
        `);
        assert(t10.hasFrame && t10.hasSilhouette && t10.hasDisclaimer && t10.checklistCount === 4 &&
               t10.hasDistance && t10.hasLight && t10.hasVisibility && t10.hasStillness,
            'Test 10: Camera Setup Guidance (Frame Graphic + 4-point Checklist)',
            JSON.stringify(t10));

        // ----------------------------------------------------
        // Advance to Step 5: Readiness Check & First Session
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-next').click();
        `);
        await new Promise(r => setTimeout(r, 300));
        await captureStepScreenshot(win, 'phase4-onboarding-readiness.png');

        // ----------------------------------------------------
        // Test 11: User-Triggered Camera Readiness (Not Auto-Started)
        // ----------------------------------------------------
        const t11 = await win.webContents.executeJavaScript(`
            (() => {
                const badge = document.getElementById('ob-status-badge');
                const step = window.__vytaDiagnostics.getOnboardingStep();
                const sessionState = window.__vytaDiagnostics.getState();
                return {
                    step,
                    badgeText: badge?.textContent,
                    badgeClass: badge?.className,
                    sessionState // 'IDLE'
                };
            })()
        `);
        assert(t11.step === 5 && t11.badgeText === 'Camera not checked' && (t11.sessionState === 'IDLE' || t11.sessionState === 0),
            'Test 11: User-Triggered Camera Readiness (Initial State: Camera not checked, No Auto-Start)',
            JSON.stringify(t11));

        // ----------------------------------------------------
        // Test 12: Camera Check Safe Probe Execution & Track Teardown
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-check-camera').click();
        `);
        // Allow time for enumerateDevices and getUserMedia
        await new Promise(r => setTimeout(r, 1200));

        const t12 = await win.webContents.executeJavaScript(`
            (() => {
                const badge = document.getElementById('ob-status-badge');
                const log = document.getElementById('ob-diagnostic-log')?.textContent;
                const liveSettings = window.__vytaDiagnostics.getSettings();
                return {
                    badgeText: badge?.textContent,
                    badgeClass: badge?.className,
                    log,
                    hasLiveSettings: !!liveSettings // must be null because tracks stopped immediately!
                };
            })()
        `);
        assert(t12.badgeText === 'Camera ready' && !t12.hasLiveSettings && t12.log.includes('Camera Ready:'),
            'Test 12: Safe Camera Stream Probe & Immediate Track Teardown',
            JSON.stringify(t12));

        // Capture updated screenshot with camera ready badge
        await captureStepScreenshot(win, 'phase4-onboarding-readiness.png');

        // ----------------------------------------------------
        // Test 13: Option A - Guided Breathing Canvas (No Camera Required)
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-start-breathing').click();
        `);
        await new Promise(r => setTimeout(r, 500));

        const t13 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const overviewPane = document.getElementById('view-overview');
                const completed = localStorage.getItem('vyta_onboarding_completed');
                return {
                    overlayHidden: overlay.hidden,
                    overviewActive: overviewPane.classList.contains('active'),
                    completed
                };
            })()
        `);
        assert(t13.overlayHidden && t13.overviewActive && t13.completed === 'true',
            'Test 13: Option A Routes to Guided Breathing & Persists Completion',
            JSON.stringify(t13));

        // ----------------------------------------------------
        // Test 14: Settings Reopen Onboarding Flow
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            // Navigate to Settings
            const tabs = document.querySelectorAll('.nav-tab');
            const settingsTab = Array.from(tabs).find(t => t.dataset.tab === 'settings');
            settingsTab.click();
        `);
        await new Promise(r => setTimeout(r, 300));

        await win.webContents.executeJavaScript(`
            document.getElementById('btn-reopen-onboarding').click();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t14 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const step = window.__vytaDiagnostics.getOnboardingStep();
                return { visible: !overlay.hidden, step };
            })()
        `);
        assert(t14.visible && t14.step === 1,
            'Test 14: Replay Onboarding Button in Settings Opens Step 1',
            JSON.stringify(t14));

        // ----------------------------------------------------
        // Test 15: Option B - Live Sensing Workstation Choice
        // ----------------------------------------------------
        // Jump directly to step 5 to test Option B
        await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.setOnboardingStep(5);
            document.getElementById('btn-ob-start-sensing').click();
        `);
        await new Promise(r => setTimeout(r, 500));

        const t15 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const livePane = document.getElementById('view-live-session');
                const sessionState = window.__vytaDiagnostics.getState();
                return {
                    overlayHidden: overlay.hidden,
                    livePaneActive: livePane.classList.contains('active'),
                    cameraIdle: sessionState === 'IDLE' || sessionState === 0
                };
            })()
        `);
        assert(t15.overlayHidden && t15.livePaneActive && t15.cameraIdle,
            'Test 15: Option B Routes to Live Sensing Workstation in IDLE State',
            JSON.stringify(t15));

        // ----------------------------------------------------
        // Test 16: Skip Introduction Flow
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.resetOnboarding();
        `);
        await new Promise(r => setTimeout(r, 300));

        await win.webContents.executeJavaScript(`
            document.getElementById('btn-ob-welcome-skip').click();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t16 = await win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('onboarding-overlay');
                const overviewPane = document.getElementById('view-overview');
                const completed = localStorage.getItem('vyta_onboarding_completed');
                return {
                    overlayHidden: overlay.hidden,
                    overviewActive: overviewPane.classList.contains('active'),
                    completed
                };
            })()
        `);
        assert(t16.overlayHidden && t16.overviewActive && t16.completed === 'true',
            'Test 16: Skip Introduction Bypasses Onboarding to Overview',
            JSON.stringify(t16));

        // ----------------------------------------------------
        // Test 17: Reduced Motion Styles Compatibility
        // ----------------------------------------------------
        const t17 = await win.webContents.executeJavaScript(`
            (() => {
                document.body.classList.add('reduced-motion');
                const overlay = document.getElementById('onboarding-overlay');
                overlay.hidden = false;
                window.__vytaDiagnostics.setOnboardingStep(1);
                const orb = document.querySelector('.ob-hero-orb');
                const glow = document.querySelector('.ob-ambient-glow');
                const orbStyle = window.getComputedStyle(orb);
                const glowStyle = window.getComputedStyle(glow);
                return {
                    orbAnim: orbStyle.animationName,
                    glowAnim: glowStyle.animationName
                };
            })()
        `);
        assert(t17.orbAnim === 'none' && t17.glowAnim === 'none',
            'Test 17: Reduced Motion Accurately Suppresses Onboarding Animations',
            JSON.stringify(t17));

        // ----------------------------------------------------
        // Test 18: SDK Integrity & Camera Isolation
        // ----------------------------------------------------
        const t18 = await win.webContents.executeJavaScript(`
            (() => {
                // Ensure camera is not running and SDK has not been corrupted
                const liveSettings = window.__vytaDiagnostics.getSettings();
                const sessionState = window.__vytaDiagnostics.getState();
                return {
                    liveSettings: liveSettings,
                    sessionState: sessionState,
                    sdkHealthy: typeof window.__smartspectraBridge === 'object'
                };
            })()
        `);
        assert(t18.liveSettings === null && (t18.sessionState === 'IDLE' || t18.sessionState === 0) && t18.sdkHealthy,
            'Test 18: SDK Integrity & Complete Camera Hardware Isolation',
            JSON.stringify(t18));

        // Reset to clean completed state for user
        await win.webContents.executeJavaScript(`
            document.body.classList.remove('reduced-motion');
            document.getElementById('onboarding-overlay').hidden = true;
            localStorage.setItem('vyta_onboarding_completed', 'true');
        `);

        console.log('====================================================');
        const passedCount = results.filter(r => r.passed).length;
        console.log(`Results: ${passedCount}/${results.length} tests passed.`);
        console.log('====================================================');

        if (passedCount === results.length) {
            console.log('[TEST] All 18 Phase 4 tests PASSED!');
            setTimeout(() => {
                win.destroy();
                app.quit();
                process.exit(0);
            }, 600);
        } else {
            console.error('[TEST] Some tests failed!');
            setTimeout(() => {
                win.destroy();
                app.quit();
                process.exit(1);
            }, 600);
        }
    } catch (err) {
        console.error('[TEST] Unhandled exception in test suite:', err);
        win.destroy();
        app.quit();
        process.exit(1);
    }
}

module.exports = { runPhase4Tests };

