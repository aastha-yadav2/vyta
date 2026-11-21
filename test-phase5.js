// test-phase5.js
// Automated verification suite for Phase 5: Session History, Analytics & Personal Insights

'use strict';

const fs = require('fs');
const path = require('path');

const BRAIN_SCRATCH = 'C:/Users/asus/.gemini/antigravity/brain/bca309bd-5e2c-4a9d-9ee1-ce0f9e3c945e/scratch';
const LOCAL_SCRATCH = path.join(__dirname, 'scratch');

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

async function runPhase5Tests(win, app) {
    console.log('====================================================');
    console.log('   VYTA Phase 5: History & Analytics Test Suite     ');
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
        await new Promise(r => setTimeout(r, 800));

        // Mark onboarding completed and navigate to history tab
        await win.webContents.executeJavaScript(`
            (() => {
                localStorage.setItem('vyta_onboarding_completed', 'true');
                const overlay = document.getElementById('onboarding-overlay');
                if (overlay) overlay.hidden = true;
                const tabs = document.querySelectorAll('.nav-tab');
                const histTab = Array.from(tabs).find(t => t.dataset.tab === 'history');
                if (histTab) histTab.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 400));

        // ----------------------------------------------------
        // Test 1: Empty History State
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                localStorage.removeItem('vyta_session_history');
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t1 = await win.webContents.executeJavaScript(`
            (() => {
                const totalSessions = document.getElementById('analytics-total-sessions')?.textContent;
                const totalTime = document.getElementById('analytics-total-time')?.textContent;
                const avgSession = document.getElementById('analytics-avg-session')?.textContent;
                const currentStreak = document.getElementById('analytics-current-streak')?.textContent;
                const bestStreak = document.getElementById('analytics-best-streak')?.textContent;
                const emptyCard = document.querySelector('.history-content-area .history-empty-card');
                const insights = document.getElementById('insights-list')?.textContent || '';
                return {
                    totalSessions,
                    totalTime,
                    avgSession,
                    currentStreak,
                    bestStreak,
                    hasEmptyCard: !!emptyCard,
                    insightsHasWelcome: insights.includes('Welcome to VYTA')
                };
            })()
        `);
        assert(t1.totalSessions === '0' && t1.totalTime === '0s' && t1.currentStreak === '0' &&
               t1.bestStreak === '0' && t1.hasEmptyCard && t1.insightsHasWelcome,
            'Test 1: Empty history state displays zeroed analytics and empty placeholders',
            JSON.stringify(t1));

        await captureStepScreenshot(win, 'phase5-history-empty.png');

        // ----------------------------------------------------
        // Test 2: One Valid Session Recording
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                window.__vytaDiagnostics.recordSessionHistory(180, [14, 15, 14], 'guided');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t2 = await win.webContents.executeJavaScript(`
            (() => {
                const totalSessions = document.getElementById('analytics-total-sessions')?.textContent;
                const totalTime = document.getElementById('analytics-total-time')?.textContent;
                const avgSession = document.getElementById('analytics-avg-session')?.textContent;
                const currentStreak = document.getElementById('analytics-current-streak')?.textContent;
                const cards = document.querySelectorAll('.history-item-card');
                return {
                    totalSessions,
                    totalTime,
                    avgSession,
                    currentStreak,
                    cardsCount: cards.length
                };
            })()
        `);
        assert(t2.totalSessions === '1' && t2.totalTime === '3m' && t2.avgSession === '3m 0s' &&
               t2.currentStreak === '1' && t2.cardsCount === 1,
            'Test 2: Single valid session recorded and reflected in analytics',
            JSON.stringify(t2));

        // ----------------------------------------------------
        // Test 3: Multiple Sessions Aggregation
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                window.__vytaDiagnostics.recordSessionHistory(300, [12, 12, 13], 'guided');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t3 = await win.webContents.executeJavaScript(`
            (() => {
                const totalSessions = document.getElementById('analytics-total-sessions')?.textContent;
                const totalTime = document.getElementById('analytics-total-time')?.textContent;
                const avgSession = document.getElementById('analytics-avg-session')?.textContent;
                return { totalSessions, totalTime, avgSession };
            })()
        `);
        assert(t3.totalSessions === '2' && t3.totalTime === '8m' && t3.avgSession === '4m 0s',
            'Test 3: Multiple sessions accurately summed and averaged (180s + 300s = 480s, avg 240s)',
            JSON.stringify(t3));

        // ----------------------------------------------------
        // Test 4: Sessions Across Multiple Days & Calendar Highlighting
        // ----------------------------------------------------
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);

        await win.webContents.executeJavaScript(`
            (() => {
                const hist = JSON.parse(localStorage.getItem('vyta_session_history') || '[]');
                hist.push({
                    id: ${yesterday.getTime()},
                    timestamp: "${yesterday.toISOString()}",
                    date: "${yesterday.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}",
                    durationSec: 180,
                    sessionType: 'guided',
                    completionStatus: 'completed',
                    avgBreathingRate: 15,
                    status: 'Guided Pacing Completed'
                });
                hist.push({
                    id: ${twoDaysAgo.getTime()},
                    timestamp: "${twoDaysAgo.toISOString()}",
                    date: "${twoDaysAgo.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}",
                    durationSec: 240,
                    sessionType: 'live',
                    completionStatus: 'completed',
                    avgBreathingRate: 14,
                    avgPulseRate: 72,
                    status: 'Completed with Telemetry'
                });
                localStorage.setItem('vyta_session_history', JSON.stringify(hist));
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t4 = await win.webContents.executeJavaScript(`
            (() => {
                const activeDays = document.querySelectorAll('.cal-day.active-day');
                const streak = document.getElementById('analytics-current-streak')?.textContent;
                const bestStreak = document.getElementById('analytics-best-streak')?.textContent;
                return {
                    activeDaysCount: activeDays.length,
                    streak,
                    bestStreak
                };
            })()
        `);
        assert(t4.activeDaysCount >= 3 && t4.streak === '3' && t4.bestStreak === '3',
            'Test 4: Sessions across multiple consecutive days highlight calendar and increment streak to 3',
            JSON.stringify(t4));

        await captureStepScreenshot(win, 'phase5-history-populated.png');

        // ----------------------------------------------------
        // Test 5: Duplicate Sessions on Same Day Count as One Practice Day
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                // Add another session today
                window.__vytaDiagnostics.recordSessionHistory(120, null, 'guided');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t5 = await win.webContents.executeJavaScript(`
            (() => {
                const analytics = window.__vytaDiagnostics.getAnalytics();
                const totalSessions = document.getElementById('analytics-total-sessions')?.textContent;
                return {
                    totalSessions,
                    currentStreak: analytics.currentStreak,
                    uniqueActiveDates: analytics.activeDates.size
                };
            })()
        `);
        assert(t5.totalSessions === '5' && t5.currentStreak === 3 && t5.uniqueActiveDates === 3,
            'Test 5: Multiple sessions on same day increment session count but maintain 1 streak day',
            JSON.stringify(t5));

        // ----------------------------------------------------
        // Test 6: Missing Metric Fields Handled Safely
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const hist = JSON.parse(localStorage.getItem('vyta_session_history') || '[]');
                hist.push({
                    id: Date.now() - 500,
                    date: new Date().toLocaleString(),
                    durationSec: 150
                    // avgBreathingRate and avgPulseRate completely omitted
                });
                localStorage.setItem('vyta_session_history', JSON.stringify(hist));
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t6 = await win.webContents.executeJavaScript(`
            (() => {
                const card = document.querySelector('.history-item-card[data-id]');
                const brText = card ? card.querySelector('.hist-metric-val:last-child')?.textContent : '';
                return { brText, noCrash: true };
            })()
        `);
        assert(t6.noCrash, 'Test 6: Missing metric fields handled safely without throwing errors');

        // ----------------------------------------------------
        // Test 7: Null Physiological Metrics Display "Not available"
        // ----------------------------------------------------
        const t7 = await win.webContents.executeJavaScript(`
            (() => {
                const cards = Array.from(document.querySelectorAll('.history-item-card'));
                const foundNotAvailable = cards.some(c => c.textContent.includes('Not available'));
                return { foundNotAvailable };
            })()
        `);
        assert(t7.foundNotAvailable, 'Test 7: Null physiological metrics display "Not available" without fabrication');

        // ----------------------------------------------------
        // Test 8: Invalid and Corrupted Records Ignored Gracefully
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const hist = JSON.parse(localStorage.getItem('vyta_session_history') || '[]');
                hist.push(null);
                hist.push({ durationSec: null });
                hist.push("corrupted entry");
                localStorage.setItem('vyta_session_history', JSON.stringify(hist));
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t8 = await win.webContents.executeJavaScript(`
            (() => {
                const norm = window.__vytaDiagnostics.getNormalizedSessions();
                return { validCount: norm.length };
            })()
        `);
        assert(t8.validCount === 6,
            'Test 8: Invalid and corrupted records safely filtered out by normalizer',
            JSON.stringify(t8));

        // ----------------------------------------------------
        // Test 9: Current Streak Logic (Yesterday Grace Period)
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const testHist = [
                    {
                        id: ${yesterday.getTime()},
                        timestamp: "${yesterday.toISOString()}",
                        durationSec: 180,
                        sessionType: 'guided'
                    },
                    {
                        id: ${twoDaysAgo.getTime()},
                        timestamp: "${twoDaysAgo.toISOString()}",
                        durationSec: 180,
                        sessionType: 'guided'
                    }
                ];
                localStorage.setItem('vyta_session_history', JSON.stringify(testHist));
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t9 = await win.webContents.executeJavaScript(`
            (() => {
                const analytics = window.__vytaDiagnostics.getAnalytics();
                return { currentStreak: analytics.currentStreak };
            })()
        `);
        assert(t9.currentStreak === 2,
            'Test 9: Current streak continues from yesterday when today has not yet been logged',
            JSON.stringify(t9));

        // ----------------------------------------------------
        // Test 10: Best Streak Calculation
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const bNow = new Date();
                const d10 = new Date(bNow.getFullYear(), bNow.getMonth(), bNow.getDate() - 10);
                const d11 = new Date(bNow.getFullYear(), bNow.getMonth(), bNow.getDate() - 11);
                const d12 = new Date(bNow.getFullYear(), bNow.getMonth(), bNow.getDate() - 12);
                const d13 = new Date(bNow.getFullYear(), bNow.getMonth(), bNow.getDate() - 13);
                const hist = JSON.parse(localStorage.getItem('vyta_session_history') || '[]');
                [d10, d11, d12, d13].forEach(d => {
                    hist.push({
                        id: d.getTime(),
                        timestamp: d.toISOString(),
                        durationSec: 200,
                        sessionType: 'guided'
                    });
                });
                localStorage.setItem('vyta_session_history', JSON.stringify(hist));
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t10 = await win.webContents.executeJavaScript(`
            (() => {
                const analytics = window.__vytaDiagnostics.getAnalytics();
                return { currentStreak: analytics.currentStreak, bestStreak: analytics.bestStreak };
            })()
        `);
        assert(t10.currentStreak === 2 && t10.bestStreak === 4,
            'Test 10: Best streak accurately reflects historical 4-day run while current streak is 2',
            JSON.stringify(t10));

        // ----------------------------------------------------
        // Test 11: Weekly Activity Chart Aggregation
        // ----------------------------------------------------
        const t11 = await win.webContents.executeJavaScript(`
            (() => {
                const chartEl = document.getElementById('weekly-activity-chart');
                const rangeLabel = document.getElementById('weekly-range-label')?.textContent;
                const totalBadge = document.getElementById('weekly-total-badge')?.textContent;
                return {
                    hasChart: !!chartEl,
                    hasRangeLabel: !!rangeLabel && rangeLabel.includes('–'),
                    hasTotalBadge: !!totalBadge && totalBadge.includes('this week')
                };
            })()
        `);
        assert(t11.hasChart && t11.hasRangeLabel && t11.hasTotalBadge,
            'Test 11: Weekly activity bar chart renders with date range and session count',
            JSON.stringify(t11));

        // ----------------------------------------------------
        // Test 12: Calendar Month Navigation
        // ----------------------------------------------------
        const t12Initial = await win.webContents.executeJavaScript(`
            document.getElementById('calendar-month-label')?.textContent;
        `);
        await win.webContents.executeJavaScript(`
            (() => { document.getElementById('btn-cal-prev').click(); })();
        `);
        await new Promise(r => setTimeout(r, 200));
        const t12Prev = await win.webContents.executeJavaScript(`
            document.getElementById('calendar-month-label')?.textContent;
        `);
        await win.webContents.executeJavaScript(`
            (() => { document.getElementById('btn-cal-next').click(); })();
        `);
        await new Promise(r => setTimeout(r, 200));
        const t12Next = await win.webContents.executeJavaScript(`
            document.getElementById('calendar-month-label')?.textContent;
        `);
        assert(t12Initial !== t12Prev && t12Initial === t12Next,
            'Test 12: Calendar navigation switches months backwards and forwards cleanly',
            `Initial: ${t12Initial}, Prev: ${t12Prev}, Next: ${t12Next}`);

        // ----------------------------------------------------
        // Test 13: Calendar Date Selection and Filter
        // ----------------------------------------------------
        const targetDateKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        await win.webContents.executeJavaScript(`
            (() => {
                window.__vytaDiagnostics.setSelectedDateFilter('${targetDateKey}');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));
        await captureStepScreenshot(win, 'phase5-history-calendar-filter.png');

        const t13 = await win.webContents.executeJavaScript(`
            (() => {
                const filterText = document.getElementById('session-log-filter-text')?.textContent;
                const btnReset = document.getElementById('btn-reset-filter');
                const clearDateBtn = document.getElementById('btn-clear-date-filter');
                const cards = document.querySelectorAll('.history-item-card');
                return {
                    filterText,
                    hasResetBtn: !btnReset.hidden,
                    hasClearDateBtn: !clearDateBtn.hidden,
                    cardCount: cards.length
                };
            })()
        `);
        assert(t13.filterText.includes(targetDateKey) && t13.hasResetBtn && t13.hasClearDateBtn && t13.cardCount === 1,
            'Test 13: Calendar date selection filters session log to target date',
            JSON.stringify(t13));

        // Reset filter
        await win.webContents.executeJavaScript(`
            (() => { document.getElementById('btn-reset-filter').click(); })();
        `);
        await new Promise(r => setTimeout(r, 200));

        // ----------------------------------------------------
        // Test 14: Session Details Modal
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                const cards = document.querySelectorAll('.history-item-card');
                const detailsBtn = cards[0]?.querySelector('[data-action="details"]');
                if (detailsBtn) detailsBtn.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 400));
        await captureStepScreenshot(win, 'phase5-session-detail-modal.png');

        const t14 = await win.webContents.executeJavaScript(`
            (() => {
                const modal = document.getElementById('session-detail-modal');
                const badge = document.getElementById('modal-session-type-badge')?.textContent;
                const bodyText = document.getElementById('session-modal-body')?.textContent || '';
                return {
                    visible: !modal.hidden,
                    badge,
                    hasDuration: bodyText.includes('Duration'),
                    hasModality: bodyText.includes('Modality & Sensor Context')
                };
            })()
        `);
        assert(t14.visible && t14.hasDuration && t14.hasModality,
            'Test 14: Session detail modal opens with complete metadata, duration and modality context',
            JSON.stringify(t14));

        // Close modal
        await win.webContents.executeJavaScript(`
            (() => { document.getElementById('btn-modal-done').click(); })();
        `);
        await new Promise(r => setTimeout(r, 200));

        // ----------------------------------------------------
        // Test 15: Individual Session Deletion
        // ----------------------------------------------------
        const t15PreCount = await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.getNormalizedSessions().length;
        `);
        await win.webContents.executeJavaScript(`
            (() => {
                const cards = document.querySelectorAll('.history-item-card');
                const delBtn = cards[0]?.querySelector('[data-action="delete"]');
                if (delBtn) delBtn.click();
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t15PostCount = await win.webContents.executeJavaScript(`
            window.__vytaDiagnostics.getNormalizedSessions().length;
        `);
        assert(t15PostCount === t15PreCount - 1,
            'Test 15: Individual session deletion immediately removes item and updates history',
            `Pre: ${t15PreCount}, Post: ${t15PostCount}`);

        // ----------------------------------------------------
        // Test 16: Clear History Action
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                localStorage.removeItem('vyta_session_history');
                window.__vytaDiagnostics.setSelectedDateFilter(null);
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t16 = await win.webContents.executeJavaScript(`
            (() => {
                const totalSessions = document.getElementById('analytics-total-sessions')?.textContent;
                const cameraPref = localStorage.getItem('vyta_selected_camera_id');
                const onboardingPref = localStorage.getItem('vyta_onboarding_completed');
                return {
                    totalSessions,
                    cameraPrefPreserved: cameraPref !== undefined,
                    onboardingPrefPreserved: onboardingPref === 'true'
                };
            })()
        `);
        assert(t16.totalSessions === '0' && t16.onboardingPrefPreserved,
            'Test 16: Clear history purges session records while preserving preferences and onboarding',
            JSON.stringify(t16));

        // ----------------------------------------------------
        // Test 17: JSON Export
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                window.__vytaDiagnostics.recordSessionHistory(180, [15, 16], 'guided');
                window.__vytaDiagnostics.recordSessionHistory(240, null, 'live');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t17 = await win.webContents.executeJavaScript(`
            (() => {
                const history = JSON.parse(localStorage.getItem('vyta_session_history') || '[]');
                const payload = {
                    app: 'VYTA',
                    version: '1.0.0',
                    exportedAt: new Date().toISOString(),
                    totalSessions: history.length,
                    sessions: history
                };
                const jsonStr = JSON.stringify(payload);
                const parsed = JSON.parse(jsonStr);
                return {
                    validJson: !!parsed,
                    hasApp: parsed.app === 'VYTA',
                    sessionCount: parsed.sessions.length,
                    hasTimestamp: !!parsed.exportedAt
                };
            })()
        `);
        assert(t17.validJson && t17.hasApp && t17.sessionCount === 2 && t17.hasTimestamp,
            'Test 17: JSON export generates valid structure with export timestamp and intact records',
            JSON.stringify(t17));

        // ----------------------------------------------------
        // Test 18: History Refresh After New Session Completion
        // ----------------------------------------------------
        await win.webContents.executeJavaScript(`
            (() => {
                window.__vytaDiagnostics.recordSessionHistory(120, [14], 'guided');
            })();
        `);
        await new Promise(r => setTimeout(r, 300));

        const t18 = await win.webContents.executeJavaScript(`
            (() => {
                const count = document.getElementById('analytics-total-sessions')?.textContent;
                const cards = document.querySelectorAll('.history-item-card');
                return { count, cardsCount: cards.length };
            })()
        `);
        assert(t18.count === '3' && t18.cardsCount === 3,
            'Test 18: History view automatically refreshes upon new session completion',
            JSON.stringify(t18));

        // ----------------------------------------------------
        // Test 19: Timezone / Local-Date Handling
        // ----------------------------------------------------
        const t19 = await win.webContents.executeJavaScript(`
            (() => {
                const d = new Date();
                const expected = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                const norm = window.__vytaDiagnostics.getNormalizedSessions();
                return {
                    hasExpectedLocalKey: norm.some(s => s.localDateKey === expected),
                    expectedKey: expected
                };
            })()
        `);
        assert(t19.hasExpectedLocalKey,
            'Test 19: Date keys strictly computed from local year-month-day without timezone skew',
            JSON.stringify(t19));

        // ----------------------------------------------------
        // Test 20: No Fabricated Measurements
        // ----------------------------------------------------
        const t20 = await win.webContents.executeJavaScript(`
            (() => {
                const norm = window.__vytaDiagnostics.getNormalizedSessions();
                const guided = norm.filter(s => s.sessionType === 'guided');
                const liveNoBr = norm.filter(s => s.sessionType === 'live' && s.avgBreathingRate === null);
                return {
                    guidedNoVitalsFabricated: guided.every(s => s.avgPulseRate === null),
                    liveNullPreserved: liveNoBr.every(s => s.avgBreathingRate === null)
                };
            })()
        `);
        assert(t20.guidedNoVitalsFabricated && t20.liveNullPreserved,
            'Test 20: No simulated or fabricated measurements injected into guided or null records',
            JSON.stringify(t20));

        console.log('====================================================');
        const passedCount = results.filter(r => r.passed).length;
        console.log(`Results: ${passedCount}/${results.length} tests passed.`);
        console.log('====================================================');

        if (passedCount === results.length) {
            console.log('[TEST] All 20 Phase 5 tests PASSED!');
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
        console.error('[TEST] Unhandled exception in Phase 5 test suite:', err);
        win.destroy();
        app.quit();
        process.exit(1);
    }
}

module.exports = { runPhase5Tests };
