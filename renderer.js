// renderer.js
// Copyright (C) 2026 Presage Technologies, Inc.
//
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// Renderer entry point for the SmartSpectra Electron quickstart. Bundled
// into dist/renderer.bundle.js by esbuild (see package.json#scripts.build).
//
// Two high-level toggles (Cardio, Face) layered on top of the always-on
// Breathing bundle, plus four live line charts that grow as the metrics
// buffer fills and persist after Stop.
//
// Configure SMARTSPECTRA_API_KEY in your local .env file. During build,
// esbuild injects it as __SMARTSPECTRA_API_KEY__.

'use strict';

const {
    SmartSpectraSDK,
    ProcessingStatus,
    ValidationCode,
    SmartSpectraErrorCode,
    breathingMetrics,
    cardioMetrics,
    faceMetrics,
} = require('@smartspectra/node-sdk/renderer');

// Generated protobuf decoder shipped by the SDK itself. The `messages`
// subpath is renderer-safe (no koffi / FFI on its require graph), so
// esbuild folds it into dist/renderer.bundle.js cleanly.
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');

// Chart.js auto-registers all controllers/scales/elements when imported
// via the default `chart.js` entry, so the line charts below work
// out-of-the-box with no extra Chart.register() calls.
const { Chart } = require('chart.js/auto');

// === SmartSpectra API Key Configuration ===
// Injected at build time by esbuild define (see build.js) using SMARTSPECTRA_API_KEY from .env.
// Note: Build-time define injection is suitable for local development convenience.
// In a distributed production desktop application, client-side bundles are inspectable
// and keys should be provisioned dynamically via a backend auth service or OS secure storage.
const API_KEY = __SMARTSPECTRA_API_KEY__;
const isMissingApiKey = !API_KEY || API_KEY === 'replace_with_your_presage_key' || API_KEY === 'YOUR_API_KEY_HERE';
if (isMissingApiKey) {
    console.warn(
        '[VYTA] SmartSpectra API key is missing or set to placeholder. ' +
        'Please set SMARTSPECTRA_API_KEY in your local .env file and run `npm run build` before Start. ' +
        'The SDK will fail to authenticate until a valid key is provided.');
}

// DOM handles ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
    preview:           $('preview'),
    statusBadge:       $('status-badge'),
    validation:        $('validation'),
    errorBanner:       $('error-banner'),
    errorCode:         $('error-code'),
    errorMessage:      $('error-message'),
    readoutPulse:      $('readout-pulse'),
    readoutBreathing:  $('readout-breathing'),
    btnStart:          $('btn-start'),
    btnStop:           $('btn-stop'),
    btnReset:          $('btn-reset'),
    cardioToggle:      $('m-cardio'),
    faceToggle:        $('m-face'),
    panelPulseRate:    $('panel-pulse-rate'),
    panelArterial:     $('panel-arterial-pressure'),
    screenLightToggle: $('toggle-screen-light'),
    facialLumBadge:    $('facial-lum-badge'),
    lumValue:          $('lum-value'),
    cameraSelect:      $('camera-select'),
    btnRefreshCameras: $('btn-refresh-cameras'),
    camDebugPanel:     $('cam-debug-panel'),
    dbgLabel:          $('dbg-label'),
    dbgRes:            $('dbg-res'),
    dbgFpsSettings:    $('dbg-fps-settings'),
    dbgFpsLive:        $('dbg-fps-live'),
    dbgExposure:       $('dbg-exposure'),
    fpsLockToggle:     $('toggle-fps-lock'),
    sensorStatusText:  $('sensor-status-text'),
    sensorPill:        $('sensor-pill'),
    btnHeroStart:      $('btn-hero-start'),
    insightBreathingVal: $('insight-breathing-val'),
    insightBreathingCaption: $('insight-breathing-caption'),
    insightDurationVal: $('insight-duration-val'),
    insightDurationCaption: $('insight-duration-caption'),
    insightQualityVal: $('insight-quality-val'),
    insightQualityTag: $('insight-quality-tag'),
    insightLastSessionText: $('insight-last-session-text'),
    sessionTimerDisplay: $('session-timer-display'),
    historyContentArea: $('history-content-area'),
    btnClearHistory:   $('btn-clear-history'),
    settingReducedMotion: $('setting-reduced-motion'),
    settingAmbientGlow: $('setting-ambient-glow'),
    btnExportData:     $('btn-export-data'),
    btnPurgeData:      $('btn-purge-data'),
    breathingOrbContainer: $('breathing-orb-container'),
    breathingOrb:        $('breathing-orb'),
    orbAmbientGlow:      $('orb-ambient-glow'),
    ringOuter:           $('ring-outer'),
    ringMiddle:          $('ring-middle'),
    ringInner:           $('ring-inner'),
    orbPhaseText:        $('orb-phase-text'),
    orbCountdown:        $('orb-countdown'),
    orbSubText:          $('orb-sub-text'),
    heroSessionControls: $('hero-session-controls'),
    heroSessionTimer:    $('hero-session-timer'),
    btnHeroPause:        $('btn-hero-pause'),
    btnHeroResume:       $('btn-hero-resume'),
    btnHeroEnd:          $('btn-hero-end'),
    durationSelector:    $('duration-selector'),
    segInhale:           $('seg-inhale'),
    segHold:             $('seg-hold'),
    segExhale:           $('seg-exhale'),
    fillInhale:          $('fill-inhale'),
    fillHold:            $('fill-hold'),
    fillExhale:          $('fill-exhale'),
    onboardingOverlay:   $('onboarding-overlay'),
    btnOnboardingSkip:   $('btn-onboarding-skip'),
    btnObWelcomeNext:    $('btn-ob-welcome-next'),
    btnObWelcomeSkip:    $('btn-ob-welcome-skip'),
    obConsentCheckbox:   $('ob-consent-checkbox'),
    btnObReviewPrivacy:  $('btn-ob-review-privacy'),
    btnObCheckCamera:    $('btn-ob-check-camera'),
    obStatusBadge:       $('ob-status-badge'),
    obDiagnosticLog:     $('ob-diagnostic-log'),
    obTroubleshootBox:   $('ob-troubleshoot-box'),
    btnObStartBreathing: $('btn-ob-start-breathing'),
    btnObStartSensing:   $('btn-ob-start-sensing'),
    btnObBack:           $('btn-ob-back'),
    btnObNext:           $('btn-ob-next'),
    obStepIndicatorText: $('ob-step-indicator-text'),
    btnReopenOnboarding: $('btn-reopen-onboarding'),
    btnExportHistory:    $('btn-export-history'),
    analyticsTotalSessions:    $('analytics-total-sessions'),
    analyticsTotalSessionsCap: $('analytics-total-sessions-caption'),
    analyticsTotalTime:        $('analytics-total-time'),
    analyticsTotalTimeCap:     $('analytics-total-time-caption'),
    analyticsAvgSession:       $('analytics-avg-session'),
    analyticsAvgSessionCap:    $('analytics-avg-session-caption'),
    analyticsCurrentStreak:    $('analytics-current-streak'),
    analyticsCurrentStreakCap: $('analytics-current-streak-caption'),
    analyticsBestStreak:       $('analytics-best-streak'),
    analyticsBestStreakCap:    $('analytics-best-streak-caption'),
    weeklyRangeLabel:          $('weekly-range-label'),
    weeklyTotalBadge:          $('weekly-total-badge'),
    weeklyActivityChart:       $('weekly-activity-chart'),
    btnCalPrev:                $('btn-cal-prev'),
    calendarMonthLabel:        $('calendar-month-label'),
    btnCalNext:                $('btn-cal-next'),
    calendarGridContainer:     $('calendar-grid-container'),
    btnClearDateFilter:        $('btn-clear-date-filter'),
    insightsList:              $('insights-list'),
    sessionLogFilterText:      $('session-log-filter-text'),
    btnResetFilter:            $('btn-reset-filter'),
    sessionDetailModal:        $('session-detail-modal'),
    sessionModalBackdrop:      $('session-modal-backdrop'),
    modalSessionTypeBadge:     $('modal-session-type-badge'),
    modalSessionTitle:         $('modal-session-title'),
    btnModalClose:             $('btn-modal-close'),
    sessionModalBody:          $('session-modal-body'),
    btnModalDelete:            $('btn-modal-delete'),
    btnModalDone:              $('btn-modal-done'),
};

// Camera device picker & 30 FPS Lock ------------------------------------------

const CAMERA_STORAGE_KEY   = 'vyta_selected_camera_id';
const FPS_LOCK_STORAGE_KEY = 'vyta_lock_30_fps';
const IR_LABEL_PATTERN     = /\b(ir|infrared|windows hello|depth|tof)\b/i;

function loadSavedFpsLock() {
    try {
        const val = localStorage.getItem(FPS_LOCK_STORAGE_KEY);
        return val === null ? true : val === 'true';
    } catch { return true; }
}

function saveFpsLock(enabled) {
    try { localStorage.setItem(FPS_LOCK_STORAGE_KEY, String(enabled)); } catch { /* ignore */ }
}

if (els.fpsLockToggle) {
    els.fpsLockToggle.checked = loadSavedFpsLock();
    els.fpsLockToggle.addEventListener('change', () => {
        saveFpsLock(els.fpsLockToggle.checked);
    });
}

/** Returns true when a device label looks like an IR / depth / Hello camera. */
function isIrCamera(label) {
    return IR_LABEL_PATTERN.test(label || '');
}

/** Persist the chosen deviceId to localStorage. */
function saveSelectedCameraId(deviceId) {
    try { localStorage.setItem(CAMERA_STORAGE_KEY, deviceId); } catch { /* ignore */ }
}

/** Retrieve the previously persisted deviceId (may be stale if device removed). */
function loadSavedCameraId() {
    try { return localStorage.getItem(CAMERA_STORAGE_KEY) || ''; } catch { return ''; }
}

/**
 * Enumerate videoinput devices, populate the dropdown, and return the
 * deviceId that should be used for the next getUserMedia call.
 *
 * Selection priority:
 *  1. Previously saved deviceId (if still present in the device list).
 *  2. First non-IR colour camera.
 *  3. First available camera (fallback).
 *
 * Returns '' if no camera is found (caller must handle the error).
 */
async function populateCameraList() {
    const sel = els.cameraSelect;
    if (!sel) return '';

    let devices = [];
    try {
        const all = await navigator.mediaDevices.enumerateDevices();
        devices = all.filter(d => d.kind === 'videoinput');
    } catch (err) {
        console.warn('[VYTA Picker] enumerateDevices failed:', err.message);
        return '';
    }

    if (devices.length === 0) {
        sel.innerHTML = '<option value="">No cameras found</option>';
        return '';
    }

    // Build option list; mark IR cameras but keep them selectable.
    sel.innerHTML = '';
    for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const label = d.label || `Camera ${d.deviceId.slice(0, 8)}`;
        const ir = isIrCamera(label);
        opt.textContent = ir ? `⚠ ${label} (IR / depth)` : label;
        if (ir) opt.dataset.ir = '1';
        sel.appendChild(opt);
    }

    // Pick the best default.
    const saved = loadSavedCameraId();
    const savedPresent = devices.some(d => d.deviceId === saved);
    let chosen = '';

    if (savedPresent) {
        chosen = saved;
    } else {
        // Prefer first non-IR camera.
        const colorCam = devices.find(d => !isIrCamera(d.label));
        chosen = colorCam ? colorCam.deviceId : (devices[0]?.deviceId ?? '');
    }

    sel.value = chosen;
    if (chosen) saveSelectedCameraId(chosen);

    console.log('[VYTA Picker] Available cameras:', devices.map(d => ({
        id: d.deviceId.slice(0, 8),
        label: d.label,
        ir: isIrCamera(d.label),
    })));
    console.log('[VYTA Picker] Selected deviceId prefix:', chosen.slice(0, 8));

    return chosen;
}

/** Update the camera debug panel from a live MediaStreamTrack. */
function updateDebugPanel(track, liveFps) {
    if (!els.camDebugPanel) return;
    const s = typeof track.getSettings === 'function' ? track.getSettings() : {};
    if (els.camDebugPanel.hidden) els.camDebugPanel.hidden = false;

    if (els.dbgLabel)       els.dbgLabel.textContent       = s.label ?? track.label ?? '—';
    if (els.dbgRes)         els.dbgRes.textContent         = s.width && s.height ? `${s.width} × ${s.height}` : '—';
    if (els.dbgFpsSettings) els.dbgFpsSettings.textContent = s.frameRate ? `${s.frameRate.toFixed(1)} fps` : '—';
    if (els.dbgExposure)    els.dbgExposure.textContent    = [
        s.exposureMode ? `mode: ${s.exposureMode}` : null,
        s.exposureTime ? `time: ${s.exposureTime}ms` : null,
    ].filter(Boolean).join('  ') || 'auto';

    if (els.dbgFpsLive && liveFps !== undefined) {
        const ok = liveFps >= 25;
        els.dbgFpsLive.textContent = `${liveFps.toFixed(1)} fps`;
        els.dbgFpsLive.className   = 'cam-debug-val ' + (ok ? 'fps-ok' : 'fps-warn');
    }
}

// Initialise picker on page load (best-effort; full labels need a permission grant).
(async () => {
    await populateCameraList();
})();

// Refresh button.
if (els.btnRefreshCameras) {
    els.btnRefreshCameras.addEventListener('click', async () => {
        await populateCameraList();
    });
}

// Persist selection when user changes dropdown.
if (els.cameraSelect) {
    els.cameraSelect.addEventListener('change', () => {
        saveSelectedCameraId(els.cameraSelect.value);
    });
}

// Look-up tables for the ProcessingStatus / ValidationCode / SmartSpectraErrorCode integers
// so we can render readable labels without hard-coding the values.
const STATUS_NAMES = Object.fromEntries(
    Object.entries(ProcessingStatus).map(([k, v]) => [v, k.replace(/^k/, '')]),
);
const VALIDATION_NAMES = Object.fromEntries(
    Object.entries(ValidationCode).map(([k, v]) => [v, k.replace(/^k/, '')]),
);
const ERROR_CODE_NAMES = Object.fromEntries(
    Object.entries(SmartSpectraErrorCode).map(([k, v]) => [v, k.replace(/^k/, '')]),
);

let latestValidationCode = null;
let lastErrorDetails = null;

const VALIDATION_GUIDANCE = Object.freeze({
    [ValidationCode.kOk]: {
        title: 'Good Signal',
        guidance: 'Face detected and well-lit. Hold still and record.',
        type: 'ok',
    },
    [ValidationCode.kTooDark]: {
        title: 'Too Dark',
        guidance: 'Increase light on your face. Turn on a room light or point a desk lamp / screen light toward you.',
        type: 'err',
    },
    [ValidationCode.kNoFaceFound]: {
        title: 'No Face Found',
        guidance: 'Position your face and upper chest in the center of the camera frame, ~2 feet (60 cm) away, looking directly forward.',
        type: 'err',
    },
    [ValidationCode.kFrameRateTooLow]: {
        title: 'Frame Rate Too Low',
        guidance: 'Camera is delivering < 25 FPS. Frame rate must be >= 25 FPS for pulse & breathing signals.',
        type: 'err',
    },
    [ValidationCode.kMultipleFacesFound]: {
        title: 'Multiple Faces',
        guidance: 'Only one person should be visible in the camera view.',
        type: 'err',
    },
    [ValidationCode.kFaceNotCentered]: {
        title: 'Center Your Face',
        guidance: 'Move your face toward the center of the frame.',
        type: 'warn',
    },
    [ValidationCode.kTooBright]: {
        title: 'Too Bright',
        guidance: 'Direct glare or wash-out detected. Reduce bright background lighting.',
        type: 'warn',
    },
    [ValidationCode.kChestNotVisible]: {
        title: 'Chest Obscured',
        guidance: 'Move back ~2 feet (60 cm) so your upper chest and shoulders are visible in frame.',
        type: 'warn',
    },
    [ValidationCode.kExcessiveMotion]: {
        title: 'Too Much Movement',
        guidance: 'Please sit still while recording vitals.',
        type: 'warn',
    },
    [ValidationCode.kFaceTooClose]: {
        title: 'Too Close',
        guidance: 'Move back slightly from the camera.',
        type: 'warn',
    },
    [ValidationCode.kFaceTooFar]: {
        title: 'Too Far',
        guidance: 'Move closer to the camera so your face occupies the guide.',
        type: 'warn',
    },
    [ValidationCode.kFaceNotForward]: {
        title: 'Look Forward',
        guidance: 'Please face directly toward the camera.',
        type: 'warn',
    },
    [ValidationCode.kCameraTuning]: {
        title: 'Camera Tuning',
        guidance: 'Adjusting camera parameters...',
        type: 'warn',
    },
});

// Chart factory --------------------------------------------------------------
// Each chart uses { x: seconds, y: value } parsed objects. We disable
// `parsing` and `animation` so the per-event redraw (~30 fps with all
// bundles enabled) stays cheap. Each `metrics` event delivers a cumulative
// Metrics protobuf so we simply replace the dataset wholesale instead of
// appending.
function makeChart(canvasId, yLabel, lineColor = '#7fb594', fillColor = 'rgba(127, 181, 148, 0.12)') {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    const ctx = el.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data:            [],
                borderColor:     lineColor,
                backgroundColor: fillColor,
                borderWidth:     1.8,
                pointRadius:     0,
                tension:         0.1,
                fill:            !!fillColor,
            }],
        },
        options: {
            animation:    false,
            parsing:      false,
            responsive:   true,
            maintainAspectRatio: false,
            plugins: {
                legend:  { display: false },
                tooltip: { enabled: false },
            },
            scales: {
                x: {
                    type:  'linear',
                    title: { display: true, text: 'seconds', color: '#657b70', font: { size: 10 } },
                    ticks: {
                        color:    '#657b70',
                        maxTicksLimit: 8,
                        stepSize: 1,
                        font: { size: 10 },
                    },
                    grid: { color: 'rgba(127, 181, 148, 0.08)' },
                },
                y: {
                    title: { display: !!yLabel, text: yLabel || '', color: '#657b70', font: { size: 10 } },
                    ticks: { color: '#657b70', font: { size: 10 } },
                    grid:  { color: 'rgba(127, 181, 148, 0.08)' },
                },
            },
        },
    });
}

const charts = {
    breathingRate:     makeChart('chart-breathing-rate',     'BR/min', '#7fb594', 'rgba(127, 181, 148, 0.12)'),
    breathingTrace:    makeChart('chart-breathing-trace',    null,     '#a5d8bd', 'rgba(165, 216, 189, 0.08)'),
    pulseRate:         makeChart('chart-pulse-rate',         'BPM',    '#df9d76', 'rgba(223, 157, 118, 0.12)'),
    arterialPressure:  makeChart('chart-arterial-pressure',  null,     '#d9aa89', 'rgba(217, 170, 137, 0.08)'),
};

function resizeCharts() {
    for (const c of Object.values(charts)) {
        if (c && typeof c.resize === 'function') {
            try { c.resize(); } catch { /* ignore */ }
        }
    }
}

function tsToNumber(ts) {
    if (ts == null) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'bigint') return Number(ts);
    // protobufjs Long: { low, high, unsigned } with .toNumber().
    if (typeof ts.toNumber === 'function') return ts.toNumber();
    return Number(ts);
}

// Drop a chart back to an empty dataset (called on Start / Reset). Also
// clears the renderer-side accumulators so the next session starts from a
// clean slate.
function clearCharts() {
    clearAccumulated();
    for (const c of Object.values(charts)) {
        if (c && c.data && c.data.datasets && c.data.datasets[0]) {
            c.data.datasets[0].data = [];
            c.update('none');
        }
    }
    if (els.readoutPulse) els.readoutPulse.textContent     = '—';
    if (els.readoutBreathing) els.readoutBreathing.textContent = '—';
    if (els.insightBreathingVal) els.insightBreathingVal.textContent = '—';
    if (els.insightBreathingCaption) els.insightBreathingCaption.textContent = 'Awaiting session start';
    if (els.sessionTimerDisplay) els.sessionTimerDisplay.textContent = '00:00';
    if (els.insightDurationVal) els.insightDurationVal.textContent = '00:00';
    if (els.insightDurationCaption) els.insightDurationCaption.textContent = 'Ready when you are';
}

// Hide / show the two cardio panels based on the toggle. The placeholder
// overlay inside each panel handles the dimmed message; we just flip a
// class so CSS can do the rest.
function applyCardioVisibility() {
    const on = els.cardioToggle.checked;
    els.panelPulseRate.classList.toggle('disabled', !on);
    els.panelArterial.classList.toggle('disabled', !on);
}

// Session State Machine ------------------------------------------------------
const SessionState = Object.freeze({
    IDLE:             'IDLE',
    ACQUIRING_CAMERA: 'ACQUIRING_CAMERA',
    VERIFYING_CAMERA: 'VERIFYING_CAMERA',
    STARTING_SDK:     'STARTING_SDK',
    RUNNING:          'RUNNING',
    STOPPING:         'STOPPING',
});
let currentState = SessionState.IDLE;

// Sequential Diagnostics & Separation of Concerns State
// Camera Status: 'NOT_CHECKED' | 'CHECKING' | 'READY' | 'WARNING' | 'FAILED'
let currentCameraStatus = 'NOT_CHECKED';

// State counters -------------------------------------------------------------
let metricsCount = 0;
// Timestamp of the first Measurement we receive — used as the chart x-axis
// origin so seconds count from session start, not from the Unix epoch.
let timeOriginUs = null;
let activeStream = null;
let activeBoostedStream = null;   // software-gain amplified stream forwarded to SDK
let fpsMonitorCleanup = null;
const validationHistory = [];

// SDK is constructed on Start so metric toggles take effect each session.
let sdk = null;

function readRequestedMetrics() {
    const codes = [...breathingMetrics];
    if (els.cardioToggle.checked) codes.push(...cardioMetrics);
    if (els.faceToggle.checked)   codes.push(...faceMetrics);
    return codes;
}

function lastValue(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1].value;
}

// Each `metrics` event delivers the WINDOWED slice since the previous
// emit — the C++ AggregatedEdgeMetricsCalculator calls
// `metered_metrics_.Clear()` after each packet. To build a growing
// line chart we APPEND the slices into renderer-side accumulator
// arrays.
//
// The `accumulatedMetrics` event looks like a tempting shortcut but
// only carries data when `enableAccumulatedOutput` is true AND the
// side packet has propagated correctly; replacing wholesale from it
// silently produces empty charts if anything drops along the way.

// Per-metric accumulators. Each entry is a decoded `Measurement` (we
// keep the proto shape so the chart datapoint conversion below can read
// `.timestamp` and `.value`). Reset on Start.
const accumulated = {
    breathingRate:    [],
    breathingTrace:   [],
    pulseRate:        [],
    arterialPressure: [],
};

function clearAccumulated() {
    accumulated.breathingRate.length    = 0;
    accumulated.breathingTrace.length   = 0;
    accumulated.pulseRate.length        = 0;
    accumulated.arterialPressure.length = 0;
}

// Append decoded Measurements to one of the accumulators and refresh
// the matching chart from scratch (Chart.js needs the full data array
// every redraw; we don't trust incremental dataset mutation across
// `update('none')` calls).
function appendAndRedraw(buffer, chart, newMeasurements, t0Us) {
    if (!newMeasurements || newMeasurements.length === 0) return;
    for (const m of newMeasurements) buffer.push(m);
    const points = new Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const m = buffer[i];
        points[i] = { x: (tsToNumber(m.timestamp) - t0Us) / 1_000_000, y: m.value };
    }
    chart.data.datasets[0].data = points;
    chart.update('none');
}

function handleMetrics(metrics) {
    // Pin the chart x-axis origin to the first Measurement we ever see
    // (any field), so seconds count from session start.
    const firstTs = (
        metrics.breathing?.rate?.[0]?.timestamp        ??
        metrics.breathing?.upperTrace?.[0]?.timestamp  ??
        metrics.cardio?.pulseRate?.[0]?.timestamp      ??
        metrics.cardio?.arterialPressureTrace?.[0]?.timestamp
    );
    if (timeOriginUs === null && firstTs != null) {
        timeOriginUs = tsToNumber(firstTs);
    }
    const t0 = timeOriginUs ?? 0;

    appendAndRedraw(accumulated.breathingRate,    charts.breathingRate,    metrics.breathing?.rate,                t0);
    appendAndRedraw(accumulated.breathingTrace,   charts.breathingTrace,   metrics.breathing?.upperTrace,          t0);
    appendAndRedraw(accumulated.pulseRate,        charts.pulseRate,        metrics.cardio?.pulseRate,              t0);
    appendAndRedraw(accumulated.arterialPressure, charts.arterialPressure, metrics.cardio?.arterialPressureTrace,  t0);

    // Live numeric readouts: latest sample in the windowed slice (NOT
    // the accumulator) so the readouts track the most-recent estimate
    // without lagging behind as buffers grow.
    const br = lastValue(metrics.breathing?.rate);
    if (br != null) {
        els.readoutBreathing.textContent = br.toFixed(0);
        if (els.insightBreathingVal) els.insightBreathingVal.textContent = br.toFixed(0);
        if (els.insightBreathingCaption) els.insightBreathingCaption.textContent = 'Active measurement';
        currentSessionBreathingSamples.push(br);
    }
    const pr = lastValue(metrics.cardio?.pulseRate);
    if (pr != null) els.readoutPulse.textContent = pr.toFixed(0);
}

// Adaptive Breathing Canvas & Session Tracking --------------------------------

const BreathingPhase = {
    READY: 'Ready',
    INHALE: 'Inhale',
    HOLD: 'Hold',
    EXHALE: 'Exhale',
    PAUSED: 'Paused',
    COMPLETED: 'Completed'
};

class AdaptiveBreathingCanvas {
    constructor(elements) {
        this.els = elements;
        this.targetDurationSec = 180; // default 3 min
        this.state = BreathingPhase.READY;
        this.totalActiveElapsedMs = 0;
        this.activeSegmentStart = null;
        this.rafId = null;
        this.isSessionActive = false;
        this.loop = this.loop.bind(this);
    }

    setTargetDurationMinutes(mins) {
        this.targetDurationSec = mins * 60;
        console.log(`[BreathingCanvas] Target duration set to: ${mins} min (${this.targetDurationSec}s)`);
    }

    getState() {
        return this.state;
    }

    isActive() {
        return this.isSessionActive && this.state !== BreathingPhase.PAUSED;
    }

    start() {
        if (this.isSessionActive && this.state !== BreathingPhase.PAUSED) return;
        this.isSessionActive = true;
        this.totalActiveElapsedMs = 0;
        this.activeSegmentStart = performance.now();
        this.state = BreathingPhase.INHALE;

        if (this.els.breathingOrbContainer) {
            this.els.breathingOrbContainer.classList.remove('paused-session');
            this.els.breathingOrbContainer.classList.add('active-session');
        }
        if (this.els.btnHeroStart) this.els.btnHeroStart.hidden = true;
        if (this.els.heroSessionControls) this.els.heroSessionControls.hidden = false;
        if (this.els.btnHeroPause) this.els.btnHeroPause.hidden = false;
        if (this.els.btnHeroResume) this.els.btnHeroResume.hidden = true;
        if (this.els.durationSelector) this.els.durationSelector.classList.add('locked');
        if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Guidance active';

        currentSessionBreathingSamples = [];

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(this.loop);
    }

    pause() {
        if (!this.isSessionActive || this.state === BreathingPhase.PAUSED) return;
        if (this.activeSegmentStart !== null) {
            this.totalActiveElapsedMs += performance.now() - this.activeSegmentStart;
            this.activeSegmentStart = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        const pausedOffsetMs = this.totalActiveElapsedMs % 12000;
        let pausedPhaseName = 'Inhale';
        let remSec = 4;
        if (pausedOffsetMs < 4000) {
            pausedPhaseName = 'Inhale';
            remSec = Math.ceil((4000 - pausedOffsetMs) / 1000);
        } else if (pausedOffsetMs < 6000) {
            pausedPhaseName = 'Hold';
            remSec = Math.ceil((6000 - pausedOffsetMs) / 1000);
        } else {
            pausedPhaseName = 'Exhale';
            remSec = Math.ceil((12000 - pausedOffsetMs) / 1000);
        }

        this.state = BreathingPhase.PAUSED;

        if (this.els.breathingOrbContainer) {
            this.els.breathingOrbContainer.classList.remove('active-session');
            this.els.breathingOrbContainer.classList.add('paused-session');
        }
        if (this.els.btnHeroPause) this.els.btnHeroPause.hidden = true;
        if (this.els.btnHeroResume) this.els.btnHeroResume.hidden = false;
        if (this.els.orbPhaseText) this.els.orbPhaseText.textContent = 'Paused';
        if (this.els.orbCountdown) this.els.orbCountdown.textContent = `${remSec}s`;
        if (this.els.orbSubText) this.els.orbSubText.textContent = `Paused at ${pausedPhaseName} • Tap Resume`;
        if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Session paused';
    }

    resume() {
        if (!this.isSessionActive || this.state !== BreathingPhase.PAUSED) return;
        this.activeSegmentStart = performance.now();

        const offsetMs = this.totalActiveElapsedMs % 12000;
        if (offsetMs < 4000) this.state = BreathingPhase.INHALE;
        else if (offsetMs < 6000) this.state = BreathingPhase.HOLD;
        else this.state = BreathingPhase.EXHALE;

        if (this.els.breathingOrbContainer) {
            this.els.breathingOrbContainer.classList.remove('paused-session');
            this.els.breathingOrbContainer.classList.add('active-session');
        }
        if (this.els.btnHeroPause) this.els.btnHeroPause.hidden = false;
        if (this.els.btnHeroResume) this.els.btnHeroResume.hidden = true;
        if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Guidance active';

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(this.loop);
    }

    endSession(isAutoCompleted = false) {
        if (!this.isSessionActive && this.state === BreathingPhase.READY) return;

        if (this.activeSegmentStart !== null) {
            this.totalActiveElapsedMs += performance.now() - this.activeSegmentStart;
            this.activeSegmentStart = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        const totalActiveSec = Math.floor(this.totalActiveElapsedMs / 1000);

        if (totalActiveSec >= 5) {
            recordSessionHistory(totalActiveSec, currentSessionBreathingSamples);
        }

        this.isSessionActive = false;
        this.state = isAutoCompleted ? BreathingPhase.COMPLETED : BreathingPhase.READY;

        this.resetVisuals(isAutoCompleted, totalActiveSec);
    }

    complete() {
        this.endSession(true);
    }

    resetVisuals(isAutoCompleted, totalActiveSec) {
        if (this.els.breathingOrbContainer) {
            this.els.breathingOrbContainer.classList.remove('active-session', 'paused-session');
        }
        if (this.els.breathingOrb) {
            this.els.breathingOrb.style.transform = '';
            this.els.breathingOrb.style.opacity = '';
        }
        if (this.els.orbAmbientGlow) {
            this.els.orbAmbientGlow.style.transform = '';
            this.els.orbAmbientGlow.style.opacity = '';
        }
        if (this.els.ringOuter) this.els.ringOuter.style.transform = '';
        if (this.els.ringMiddle) this.els.ringMiddle.style.transform = '';
        if (this.els.ringInner) this.els.ringInner.style.transform = '';

        if (this.els.fillInhale) this.els.fillInhale.style.width = '0%';
        if (this.els.fillHold) this.els.fillHold.style.width = '0%';
        if (this.els.fillExhale) this.els.fillExhale.style.width = '0%';
        if (this.els.segInhale) this.els.segInhale.classList.remove('active', 'completed');
        if (this.els.segHold) this.els.segHold.classList.remove('active', 'completed');
        if (this.els.segExhale) this.els.segExhale.classList.remove('active', 'completed');

        if (this.els.heroSessionControls) this.els.heroSessionControls.hidden = true;
        if (this.els.btnHeroStart) this.els.btnHeroStart.hidden = false;
        if (this.els.durationSelector) this.els.durationSelector.classList.remove('locked');

        if (isAutoCompleted) {
            if (this.els.orbPhaseText) this.els.orbPhaseText.textContent = 'Completed';
            if (this.els.orbCountdown) this.els.orbCountdown.textContent = 'Complete';
            if (this.els.orbSubText) this.els.orbSubText.textContent = `${totalActiveSec}s session recorded`;
            if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Session completed';

            setTimeout(() => {
                if (this.state === BreathingPhase.COMPLETED) {
                    this.state = BreathingPhase.READY;
                    if (this.els.orbPhaseText) this.els.orbPhaseText.textContent = 'Breathe';
                    if (this.els.orbCountdown) this.els.orbCountdown.textContent = 'Ready';
                    if (this.els.orbSubText) this.els.orbSubText.textContent = 'Pacing Guide';
                    if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Ready when you are';
                }
            }, 3500);
        } else {
            if (this.els.orbPhaseText) this.els.orbPhaseText.textContent = 'Breathe';
            if (this.els.orbCountdown) this.els.orbCountdown.textContent = 'Ready';
            if (this.els.orbSubText) this.els.orbSubText.textContent = 'Pacing Guide';
            if (this.els.insightDurationCaption) this.els.insightDurationCaption.textContent = 'Ready when you are';
        }
    }

    loop(now) {
        if (!this.isSessionActive || this.state === BreathingPhase.PAUSED) return;

        const currentElapsedMs = this.totalActiveElapsedMs + (now - this.activeSegmentStart);
        const currentElapsedSec = Math.floor(currentElapsedMs / 1000);

        // Check target duration
        if (this.targetDurationSec > 0 && currentElapsedSec >= this.targetDurationSec) {
            this.complete();
            return;
        }

        // Format timer values
        const mins = Math.floor(currentElapsedSec / 60).toString().padStart(2, '0');
        const secs = (currentElapsedSec % 60).toString().padStart(2, '0');
        const formatted = `${mins}:${secs}`;

        if (this.els.heroSessionTimer) {
            if (this.targetDurationSec > 0) {
                const targetMins = Math.floor(this.targetDurationSec / 60).toString().padStart(2, '0');
                const targetSecs = (this.targetDurationSec % 60).toString().padStart(2, '0');
                this.els.heroSessionTimer.textContent = `${formatted} / ${targetMins}:${targetSecs}`;
            } else {
                this.els.heroSessionTimer.textContent = `${formatted} (Open)`;
            }
        }
        if (this.els.sessionTimerDisplay) this.els.sessionTimerDisplay.textContent = formatted;
        if (this.els.insightDurationVal) this.els.insightDurationVal.textContent = formatted;

        // Deterministic 12s Breathing Cycle
        // Inhale: 4000ms | Hold: 2000ms | Exhale: 6000ms
        const cycleOffsetMs = currentElapsedMs % 12000;
        let phase = BreathingPhase.INHALE;
        let phaseProgress = 0;
        let phaseRemainingSec = 0;
        let phaseDisplay = 'Breathe In';

        if (cycleOffsetMs < 4000) {
            phase = BreathingPhase.INHALE;
            phaseProgress = cycleOffsetMs / 4000;
            phaseRemainingSec = Math.ceil((4000 - cycleOffsetMs) / 1000);
            phaseDisplay = 'Breathe In';

            if (this.els.fillInhale) this.els.fillInhale.style.width = `${(phaseProgress * 100).toFixed(1)}%`;
            if (this.els.fillHold) this.els.fillHold.style.width = '0%';
            if (this.els.fillExhale) this.els.fillExhale.style.width = '0%';
            if (this.els.segInhale) { this.els.segInhale.classList.add('active'); this.els.segInhale.classList.remove('completed'); }
            if (this.els.segHold) this.els.segHold.classList.remove('active', 'completed');
            if (this.els.segExhale) this.els.segExhale.classList.remove('active', 'completed');

        } else if (cycleOffsetMs < 6000) {
            phase = BreathingPhase.HOLD;
            phaseProgress = (cycleOffsetMs - 4000) / 2000;
            phaseRemainingSec = Math.ceil((6000 - cycleOffsetMs) / 1000);
            phaseDisplay = 'Hold';

            if (this.els.fillInhale) this.els.fillInhale.style.width = '100%';
            if (this.els.fillHold) this.els.fillHold.style.width = `${(phaseProgress * 100).toFixed(1)}%`;
            if (this.els.fillExhale) this.els.fillExhale.style.width = '0%';
            if (this.els.segInhale) { this.els.segInhale.classList.remove('active'); this.els.segInhale.classList.add('completed'); }
            if (this.els.segHold) { this.els.segHold.classList.add('active'); this.els.segHold.classList.remove('completed'); }
            if (this.els.segExhale) this.els.segExhale.classList.remove('active', 'completed');

        } else {
            phase = BreathingPhase.EXHALE;
            phaseProgress = (cycleOffsetMs - 6000) / 6000;
            phaseRemainingSec = Math.ceil((12000 - cycleOffsetMs) / 1000);
            phaseDisplay = 'Breathe Out';

            if (this.els.fillInhale) this.els.fillInhale.style.width = '100%';
            if (this.els.fillHold) this.els.fillHold.style.width = '100%';
            if (this.els.fillExhale) this.els.fillExhale.style.width = `${(phaseProgress * 100).toFixed(1)}%`;
            if (this.els.segInhale) { this.els.segInhale.classList.remove('active'); this.els.segInhale.classList.add('completed'); }
            if (this.els.segHold) { this.els.segHold.classList.remove('active'); this.els.segHold.classList.add('completed'); }
            if (this.els.segExhale) { this.els.segExhale.classList.add('active'); this.els.segExhale.classList.remove('completed'); }
        }

        this.state = phase;

        if (this.els.orbPhaseText) this.els.orbPhaseText.textContent = phaseDisplay;
        if (this.els.orbCountdown) this.els.orbCountdown.textContent = `${phaseRemainingSec}s`;
        if (this.els.orbSubText) this.els.orbSubText.textContent = `${phase} • ${phaseRemainingSec}s left`;

        // Render visual motion & transforms
        const isReduced = document.body.classList.contains('reduced-motion');
        this.renderVisuals(phase, phaseProgress, isReduced);

        this.rafId = requestAnimationFrame(this.loop);
    }

    renderVisuals(phase, progress, isReduced) {
        if (!this.els.breathingOrb) return;

        if (isReduced) {
            this.els.breathingOrb.style.transform = 'scale(1.0)';
            if (this.els.ringOuter) this.els.ringOuter.style.transform = 'scale(1.0)';
            if (this.els.ringMiddle) this.els.ringMiddle.style.transform = 'scale(1.0)';
            if (this.els.ringInner) this.els.ringInner.style.transform = 'scale(1.0)';

            let orbOpacity = 0.90;
            let glowOpacity = 0.35;
            if (phase === BreathingPhase.INHALE) {
                orbOpacity = 0.85 + 0.15 * progress;
                glowOpacity = 0.30 + 0.35 * progress;
            } else if (phase === BreathingPhase.HOLD) {
                orbOpacity = 1.0;
                glowOpacity = 0.65;
            } else {
                orbOpacity = 1.0 - 0.15 * progress;
                glowOpacity = 0.65 - 0.35 * progress;
            }
            this.els.breathingOrb.style.opacity = orbOpacity.toFixed(3);
            if (this.els.orbAmbientGlow) this.els.orbAmbientGlow.style.opacity = glowOpacity.toFixed(3);
            return;
        }

        const ease = (1 - Math.cos(Math.PI * progress)) / 2;
        let scale = 0.92;
        let glowScale = 0.90;
        let glowOpacity = 0.22;
        let ringScale = 0.95;

        if (phase === BreathingPhase.INHALE) {
            scale = 0.92 + 0.36 * ease;
            glowScale = 0.90 + 0.35 * ease;
            glowOpacity = 0.22 + 0.48 * ease;
            ringScale = 0.95 + 0.22 * ease;
        } else if (phase === BreathingPhase.HOLD) {
            const microFloat = 0.004 * Math.sin(progress * Math.PI);
            scale = 1.28 + microFloat;
            glowScale = 1.25 + microFloat;
            glowOpacity = 0.70;
            ringScale = 1.17;
        } else {
            scale = 1.28 - 0.36 * ease;
            glowScale = 1.25 - 0.35 * ease;
            glowOpacity = 0.70 - 0.48 * ease;
            ringScale = 1.17 - 0.22 * ease;
        }

        this.els.breathingOrb.style.transform = `scale(${scale.toFixed(4)})`;
        this.els.breathingOrb.style.opacity = '1';

        if (this.els.orbAmbientGlow) {
            this.els.orbAmbientGlow.style.transform = `scale(${glowScale.toFixed(4)})`;
            this.els.orbAmbientGlow.style.opacity = glowOpacity.toFixed(3);
        }
        if (this.els.ringOuter) this.els.ringOuter.style.transform = `scale(${(ringScale * 1.12).toFixed(4)})`;
        if (this.els.ringMiddle) this.els.ringMiddle.style.transform = `scale(${(ringScale * 1.06).toFixed(4)})`;
        if (this.els.ringInner) this.els.ringInner.style.transform = `scale(${ringScale.toFixed(4)})`;
    }
}

let breathingCanvas = null;
let targetDurationMinutes = 3;
let currentSessionBreathingSamples = [];

function startSessionTimer() {
    if (breathingCanvas) {
        breathingCanvas.start();
    }
}

function stopSessionTimer(recordToHistory = true) {
    if (breathingCanvas) {
        breathingCanvas.endSession(false);
    }
}

// ============================================================================
// Phase 5: Session History, Analytics & Personal Insights
// ============================================================================

const HISTORY_STORAGE_KEY = 'vyta_session_history';

let weeklyActivityChartInstance = null;
let calendarViewingDate = new Date();
let selectedDateFilter = null; // 'YYYY-MM-DD' or null
let activeModalSessionId = null;

function loadSessionHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveSessionHistory(history) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch { /* ignore */ }
}

/** Robust Date Extraction from heterogeneous session records */
function getSessionDateObject(record) {
    if (!record) return null;
    if (record.timestamp) {
        const d = new Date(record.timestamp);
        if (!isNaN(d.getTime())) return d;
    }
    if (typeof record.id === 'number' && record.id > 1000000000000) {
        const d = new Date(record.id);
        if (!isNaN(d.getTime())) return d;
    }
    if (record.date) {
        const d = new Date(record.date);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

/** Formats a local date key (YYYY-MM-DD) avoiding timezone shifts */
function getLocalDateKey(date) {
    if (!date || isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Formats duration into human-readable string (e.g. "3m 15s" or "45s") */
function formatDuration(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

/** Normalizes older and newer session records with non-fabricating defaults */
function normalizeSession(record, index = 0) {
    if (!record || typeof record !== 'object') return null;
    const dateObj = getSessionDateObject(record);
    const duration = typeof record.durationSec === 'number' && !isNaN(record.durationSec) && record.durationSec > 0
        ? Math.round(record.durationSec)
        : 0;

    // Reject entries with no valid date and 0 duration
    if (!dateObj && duration === 0) return null;

    const id = record.id || (dateObj ? dateObj.getTime() : Date.now() - index);
    const localDateKey = dateObj ? getLocalDateKey(dateObj) : null;

    let sessionType = record.sessionType;
    if (!sessionType) {
        if (record.status && record.status.includes('Telemetry')) {
            sessionType = 'live';
        } else {
            sessionType = 'guided';
        }
    }

    return {
        id,
        raw: record,
        dateObj,
        localDateKey,
        dateFormatted: record.date || (dateObj ? dateObj.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown Date'),
        durationSec: duration,
        sessionType, // 'guided' | 'live'
        completionStatus: record.completionStatus || 'completed',
        avgBreathingRate: typeof record.avgBreathingRate === 'number' && !isNaN(record.avgBreathingRate) ? Math.round(record.avgBreathingRate) : null,
        avgPulseRate: typeof record.avgPulseRate === 'number' && !isNaN(record.avgPulseRate) ? Math.round(record.avgPulseRate) : null,
        status: record.status || (record.avgBreathingRate ? 'Completed with Telemetry' : 'Session Completed'),
        notes: typeof record.notes === 'string' ? record.notes : '',
    };
}

/** Records a new session with backwards and forwards compatibility */
function recordSessionHistory(durationSec, breathingSamples, sessionType = 'guided', extras = {}) {
    const history = loadSessionHistory();
    const avgBr = (breathingSamples && breathingSamples.length > 0)
        ? Math.round(breathingSamples.reduce((a, b) => a + b, 0) / breathingSamples.length)
        : null;
    const avgPr = (extras.pulseSamples && extras.pulseSamples.length > 0)
        ? Math.round(extras.pulseSamples.reduce((a, b) => a + b, 0) / extras.pulseSamples.length)
        : null;

    const now = new Date();
    const entry = {
        id: Date.now(),
        timestamp: now.toISOString(),
        date: now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        durationSec: Math.round(durationSec),
        sessionType,
        completionStatus: extras.completionStatus || 'completed',
        avgBreathingRate: avgBr,
        avgPulseRate: avgPr,
        status: extras.status || (avgBr ? 'Completed with Telemetry' : (sessionType === 'guided' ? 'Guided Pacing Completed' : 'Session Completed')),
        notes: '',
    };

    history.unshift(entry);
    if (history.length > 100) history.pop();
    saveSessionHistory(history);
    renderSessionHistory();
    updateLastSessionInsight(entry);
    return entry;
}

/** Calculates analytics metrics and streaks according to strict Section 8 logic */
function calculateAnalytics(normalizedSessions) {
    const totalSessions = normalizedSessions.length;
    const totalPracticeSec = normalizedSessions.reduce((acc, s) => acc + s.durationSec, 0);
    const avgDurationSec = totalSessions > 0 ? Math.round(totalPracticeSec / totalSessions) : 0;

    // Unique practice dates (YYYY-MM-DD) with duration > 0
    const activeDates = new Set();
    normalizedSessions.forEach(s => {
        if (s.localDateKey && s.durationSec > 0) {
            activeDates.add(s.localDateKey);
        }
    });

    let currentStreak = 0;
    let bestStreak = 0;

    if (activeDates.size > 0) {
        // Best Streak: longest run of consecutive calendar days across history
        const sortedDateKeys = Array.from(activeDates).sort();
        let maxRun = 1;
        let currRun = 1;

        for (let i = 1; i < sortedDateKeys.length; i++) {
            const [y1, m1, d1] = sortedDateKeys[i - 1].split('-').map(Number);
            const [y2, m2, d2] = sortedDateKeys[i].split('-').map(Number);
            const day1 = Math.round(new Date(y1, m1 - 1, d1).getTime() / 86400000);
            const day2 = Math.round(new Date(y2, m2 - 1, d2).getTime() / 86400000);

            if (day2 === day1 + 1) {
                currRun++;
                if (currRun > maxRun) maxRun = currRun;
            } else {
                currRun = 1;
            }
        }
        bestStreak = maxRun;

        // Current Streak:
        // Consecutive active days starting today.
        // If today is inactive, allow streak to continue from yesterday.
        // If neither is active, current streak is zero.
        const today = new Date();
        const todayKey = getLocalDateKey(today);
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const yesterdayKey = getLocalDateKey(yesterday);

        let anchorDate = null;
        if (activeDates.has(todayKey)) {
            anchorDate = new Date(today);
        } else if (activeDates.has(yesterdayKey)) {
            anchorDate = new Date(yesterday);
        }

        if (anchorDate) {
            let streakCounter = 0;
            const runner = new Date(anchorDate);
            while (true) {
                const runnerKey = getLocalDateKey(runner);
                if (activeDates.has(runnerKey)) {
                    streakCounter++;
                    runner.setDate(runner.getDate() - 1);
                } else {
                    break;
                }
            }
            currentStreak = streakCounter;
        } else {
            currentStreak = 0;
        }
    }

    return {
        totalSessions,
        totalPracticeSec,
        avgDurationSec,
        currentStreak,
        bestStreak,
        activeDates,
    };
}

/** Renders Section A: 5 Summary Analytics Cards */
function renderAnalyticsCards(analytics) {
    if (els.analyticsTotalSessions) {
        els.analyticsTotalSessions.textContent = analytics.totalSessions;
    }
    if (els.analyticsTotalSessionsCap) {
        els.analyticsTotalSessionsCap.textContent = analytics.totalSessions === 1 ? '1 valid practice logged' : `${analytics.totalSessions} valid practices logged`;
    }

    if (els.analyticsTotalTime) {
        const sec = analytics.totalPracticeSec;
        if (sec < 60) {
            els.analyticsTotalTime.textContent = `${sec}s`;
        } else if (sec < 3600) {
            els.analyticsTotalTime.textContent = `${Math.round(sec / 60)}m`;
        } else {
            const h = Math.floor(sec / 3600);
            const m = Math.round((sec % 3600) / 60);
            els.analyticsTotalTime.textContent = `${h}h ${m}m`;
        }
    }
    if (els.analyticsTotalTimeCap) {
        els.analyticsTotalTimeCap.textContent = analytics.totalPracticeSec > 0 ? 'Total mindfulness time' : 'No practice time yet';
    }

    if (els.analyticsAvgSession) {
        els.analyticsAvgSession.textContent = formatDuration(analytics.avgDurationSec);
    }
    if (els.analyticsAvgSessionCap) {
        els.analyticsAvgSessionCap.textContent = analytics.totalSessions > 0 ? 'Across completed practices' : 'Awaiting first session';
    }

    if (els.analyticsCurrentStreak) {
        els.analyticsCurrentStreak.textContent = analytics.currentStreak;
    }
    if (els.analyticsCurrentStreakCap) {
        els.analyticsCurrentStreakCap.textContent = analytics.currentStreak > 0
            ? (analytics.currentStreak === 1 ? '1 active day' : `${analytics.currentStreak} consecutive days`)
            : 'Start a practice today';
    }

    if (els.analyticsBestStreak) {
        els.analyticsBestStreak.textContent = analytics.bestStreak;
    }
    if (els.analyticsBestStreakCap) {
        els.analyticsBestStreakCap.textContent = analytics.bestStreak > 0
            ? (analytics.bestStreak === 1 ? '1 day record' : `${analytics.bestStreak} day record`)
            : 'Record awaits you';
    }
}

/** Renders Section B: Weekly Activity Chart (Monday–Sunday) */
function renderWeeklyActivityChart(normalizedSessions) {
    if (!els.weeklyActivityChart) return;

    // Determine current Monday–Sunday window
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const distanceToMonday = (dayOfWeek + 6) % 7; // Mon=0, Tue=1 ... Sun=6
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);

    const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekKeys = [];
    const weekCounts = [0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const k = getLocalDateKey(d);
        weekKeys.push(k);
    }

    normalizedSessions.forEach(s => {
        if (s.localDateKey && s.durationSec > 0) {
            const idx = weekKeys.indexOf(s.localDateKey);
            if (idx !== -1) {
                weekCounts[idx]++;
            }
        }
    });

    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const mStr = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const sStr = sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (els.weeklyRangeLabel) {
        els.weeklyRangeLabel.textContent = `${mStr} – ${sStr}`;
    }

    const totalWeek = weekCounts.reduce((a, b) => a + b, 0);
    if (els.weeklyTotalBadge) {
        els.weeklyTotalBadge.textContent = `${totalWeek} this week`;
    }

    // Chart.js instance setup
    if (weeklyActivityChartInstance) {
        try { weeklyActivityChartInstance.destroy(); } catch {}
        weeklyActivityChartInstance = null;
    }

    const ctx = els.weeklyActivityChart.getContext('2d');
    const maxVal = Math.max(3, ...weekCounts);

    weeklyActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'Sessions',
                data: weekCounts,
                backgroundColor: weekCounts.map((v, i) => {
                    const isToday = weekKeys[i] === getLocalDateKey(now);
                    if (isToday) return 'rgba(165, 216, 189, 0.9)';
                    return v > 0 ? 'rgba(127, 181, 148, 0.7)' : 'rgba(255, 255, 255, 0.05)';
                }),
                borderColor: weekCounts.map((v, i) => {
                    const isToday = weekKeys[i] === getLocalDateKey(now);
                    if (isToday) return '#a5d8bd';
                    return v > 0 ? 'rgba(165, 216, 189, 0.9)' : 'rgba(255, 255, 255, 0.1)';
                }),
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false,
                barPercentage: 0.65,
                categoryPercentage: 0.8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 16, 13, 0.95)',
                    titleColor: '#e0ece5',
                    bodyColor: '#a5d8bd',
                    borderColor: 'rgba(127, 181, 148, 0.3)',
                    borderWidth: 1,
                    padding: 8,
                    displayColors: false,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0]?.dataIndex;
                            return `${weekLabels[idx]} (${weekKeys[idx]})`;
                        },
                        label: (item) => `${item.raw} session${item.raw === 1 ? '' : 's'}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#657e72',
                        font: { size: 11, family: 'inherit', weight: '500' },
                    },
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: maxVal,
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        precision: 0,
                        stepSize: 1,
                        color: '#657e72',
                        font: { size: 10, family: 'inherit' },
                    },
                },
            },
        },
    });
}

/** Renders Section C: Monthly Practice Calendar */
function renderPracticeCalendar(normalizedSessions) {
    if (!els.calendarGridContainer || !els.calendarMonthLabel) return;

    const year = calendarViewingDate.getFullYear();
    const month = calendarViewingDate.getMonth();

    els.calendarMonthLabel.textContent = calendarViewingDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });

    // Group sessions by localDateKey
    const sessionsByDate = {};
    normalizedSessions.forEach(s => {
        if (s.localDateKey && s.durationSec > 0) {
            sessionsByDate[s.localDateKey] = (sessionsByDate[s.localDateKey] || 0) + 1;
        }
    });

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-based offset: 0 for Mon, 6 for Sun
    const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7;

    const todayKey = getLocalDateKey(new Date());

    let html = `
        <div class="cal-weekday">M</div>
        <div class="cal-weekday">T</div>
        <div class="cal-weekday">W</div>
        <div class="cal-weekday">T</div>
        <div class="cal-weekday">F</div>
        <div class="cal-weekday">S</div>
        <div class="cal-weekday">S</div>
    `;

    // Blank cells before day 1
    for (let i = 0; i < firstDayWeekday; i++) {
        html += `<div class="cal-day empty"></div>`;
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const dateKey = getLocalDateKey(dateObj);
        const sessionCount = sessionsByDate[dateKey] || 0;
        const isToday = (dateKey === todayKey);
        const isSelected = (dateKey === selectedDateFilter);
        const hasPractice = (sessionCount > 0);

        let classes = ['cal-day'];
        if (isToday) classes.push('today');
        if (hasPractice) classes.push('active-day');
        if (isSelected) classes.push('selected');

        const titleText = `${dateKey}: ${sessionCount} session${sessionCount === 1 ? '' : 's'}`;

        html += `
            <div class="${classes.join(' ')}" data-date="${dateKey}" title="${titleText}" role="button" tabindex="0">
                <span class="cal-day-num">${d}</span>
                ${hasPractice ? '<span class="cal-day-indicator"></span>' : ''}
            </div>
        `;
    }

    els.calendarGridContainer.innerHTML = html;

    // Clear filter button visibility
    if (els.btnClearDateFilter) {
        els.btnClearDateFilter.hidden = !selectedDateFilter;
    }

    // Attach click events to day cells
    const dayCells = els.calendarGridContainer.querySelectorAll('.cal-day:not(.empty)');
    dayCells.forEach(cell => {
        const dateKey = cell.dataset.date;
        const clickHandler = () => {
            if (selectedDateFilter === dateKey) {
                selectedDateFilter = null;
            } else {
                selectedDateFilter = dateKey;
            }
            renderSessionHistory();
        };
        cell.addEventListener('click', clickHandler);
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clickHandler();
            }
        });
    });
}

/** Renders Section D: Personal Insights (Deterministic, rule-based) */
function renderPersonalInsights(analytics, normalizedSessions) {
    if (!els.insightsList) return;

    if (analytics.totalSessions === 0) {
        els.insightsList.innerHTML = `
            <div class="insight-item">
                <span class="insight-bullet">✦</span>
                <span>Welcome to VYTA. Complete your first session to unlock personalized practice trends and consistency insights.</span>
            </div>
        `;
        return;
    }

    const insights = [];

    // Week metrics
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
    const weekKeys = new Set();
    for (let i = 0; i < 7; i++) {
        weekKeys.add(getLocalDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
    }

    const thisWeekSessions = normalizedSessions.filter(s => s.localDateKey && weekKeys.has(s.localDateKey));
    const thisWeekCount = thisWeekSessions.length;
    const thisWeekActiveDays = new Set(thisWeekSessions.map(s => s.localDateKey)).size;

    // Rule 1: Weekly Volume
    if (thisWeekCount > 0) {
        insights.push(`You've completed ${thisWeekCount} session${thisWeekCount === 1 ? '' : 's'} this week.`);
    } else {
        insights.push(`You haven't practiced yet this week. A gentle 3-minute session today can reset your rhythm.`);
    }

    // Rule 2: Active practice days this week
    if (thisWeekActiveDays > 0) {
        insights.push(`You've practiced on ${thisWeekActiveDays} different day${thisWeekActiveDays === 1 ? '' : 's'} this week.`);
    }

    // Rule 3: Average duration
    if (analytics.avgDurationSec > 0) {
        const avgMins = (analytics.avgDurationSec / 60).toFixed(1).replace('.0', '');
        insights.push(`Your average session duration is ${avgMins} minute${avgMins === '1' ? '' : 's'}.`);
    }

    // Rule 4: Longest practice
    const maxDurationSec = Math.max(...normalizedSessions.map(s => s.durationSec));
    if (maxDurationSec > 0) {
        const maxMins = (maxDurationSec / 60).toFixed(1).replace('.0', '');
        insights.push(`Your longest session was ${maxMins} minute${maxMins === '1' ? '' : 's'}.`);
    }

    // Rule 5: Streak observations
    if (analytics.currentStreak >= 2) {
        insights.push(`You've practiced ${analytics.currentStreak} days in a row.`);
    } else if (analytics.bestStreak >= 2) {
        insights.push(`Your longest practice streak is ${analytics.bestStreak} consecutive days.`);
    }

    // Rule 6: Session type split
    const guidedCount = normalizedSessions.filter(s => s.sessionType === 'guided').length;
    const liveCount = normalizedSessions.filter(s => s.sessionType === 'live').length;
    if (guidedCount > 0 && liveCount > 0) {
        insights.push(`You've explored both practices: ${guidedCount} guided breathing and ${liveCount} live sensing sessions.`);
    }

    els.insightsList.innerHTML = insights.slice(0, 4).map(text => `
        <div class="insight-item">
            <span class="insight-bullet">✦</span>
            <span>${text}</span>
        </div>
    `).join('');
}

/** Renders Section E: Historical Session List */
function renderSessionLog(normalizedSessions) {
    const container = els.historyContentArea;
    if (!container) return;

    if (els.sessionLogFilterText) {
        if (selectedDateFilter) {
            els.sessionLogFilterText.textContent = `Filtered to ${selectedDateFilter}`;
            if (els.btnResetFilter) els.btnResetFilter.hidden = false;
        } else {
            els.sessionLogFilterText.textContent = `Showing all sessions (${normalizedSessions.length})`;
            if (els.btnResetFilter) els.btnResetFilter.hidden = true;
        }
    }

    const filtered = selectedDateFilter
        ? normalizedSessions.filter(s => s.localDateKey === selectedDateFilter)
        : normalizedSessions;

    if (filtered.length === 0) {
        if (selectedDateFilter) {
            container.innerHTML = `
                <div class="history-empty-card">
                    <div class="history-empty-icon">📅</div>
                    <h3 class="history-empty-title">No sessions on this date</h3>
                    <p class="history-empty-desc">
                        No practices were recorded on ${selectedDateFilter}. Click "Show All Sessions" to reset the calendar filter.
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="history-empty-card">
                    <div class="history-empty-icon">○</div>
                    <h3 class="history-empty-title">Your journey starts here.</h3>
                    <p class="history-empty-desc">
                        Complete your first guided or live sensing session to view your physiological rhythms, session duration, and historical trend logs.
                    </p>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = filtered.map(item => {
        const durStr = formatDuration(item.durationSec);
        const brStr = item.avgBreathingRate != null ? `${item.avgBreathingRate} BR/min` : 'Not available';
        const typeBadgeClass = item.sessionType === 'live' ? 'type-live' : 'type-guided';
        const typeLabel = item.sessionType === 'live' ? 'Live Sensing' : 'Guided Breathing';

        return `
            <div class="history-item-card" data-id="${item.id}">
                <div class="history-item-left">
                    <div class="history-item-header">
                        <span class="history-item-date">${item.dateFormatted}</span>
                        <span class="history-type-badge ${typeBadgeClass}">${typeLabel}</span>
                    </div>
                    <span class="history-item-sub">${item.status}</span>
                </div>
                <div class="history-item-right">
                    <div class="history-item-metrics">
                        <div class="hist-metric">
                            <span class="hist-metric-val">${durStr}</span>
                            <span class="hist-metric-lbl">Duration</span>
                        </div>
                        <div class="hist-metric">
                            <span class="hist-metric-val">${brStr}</span>
                            <span class="hist-metric-lbl">Breathing Rate</span>
                        </div>
                    </div>
                    <div class="history-item-actions">
                        <button type="button" class="btn-item-action" data-action="details" data-id="${item.id}" title="View session details">Details</button>
                        <button type="button" class="btn-item-action btn-item-delete" data-action="delete" data-id="${item.id}" title="Delete this session record">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Attach item action handlers
    container.querySelectorAll('.btn-item-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const id = Number(btn.dataset.id) || btn.dataset.id;
            if (action === 'details') {
                openSessionDetailModal(id);
            } else if (action === 'delete') {
                deleteSessionById(id);
            }
        });
    });
}

/** Master render function unifying all 5 components of History View */
function renderSessionHistory() {
    const rawHistory = loadSessionHistory();
    const normalizedSessions = rawHistory.map(normalizeSession).filter(Boolean);
    const analytics = calculateAnalytics(normalizedSessions);

    renderAnalyticsCards(analytics);
    renderWeeklyActivityChart(normalizedSessions);
    renderPracticeCalendar(normalizedSessions);
    renderPersonalInsights(analytics, normalizedSessions);
    renderSessionLog(normalizedSessions);
}

/** Deletes an individual session by ID */
function deleteSessionById(sessionId) {
    const rawHistory = loadSessionHistory();
    const updated = rawHistory.filter(item => {
        const itemDate = getSessionDateObject(item);
        const itemId = item.id || (itemDate ? itemDate.getTime() : null);
        return itemId !== sessionId && item.id !== sessionId;
    });

    saveSessionHistory(updated);
    renderSessionHistory();
    updateLastSessionInsight();
    if (activeModalSessionId === sessionId) {
        closeSessionDetailModal();
    }
}

/** Opens the Session Details Modal */
function openSessionDetailModal(sessionId) {
    const rawHistory = loadSessionHistory();
    const normalized = rawHistory.map(normalizeSession).filter(Boolean);
    const session = normalized.find(s => s.id === sessionId);
    if (!session || !els.sessionDetailModal) return;

    activeModalSessionId = sessionId;
    els.sessionDetailModal.hidden = false;

    if (els.modalSessionTypeBadge) {
        els.modalSessionTypeBadge.textContent = session.sessionType === 'live' ? 'Live Physiological Sensing' : 'Guided Breathing Canvas';
        els.modalSessionTypeBadge.className = `modal-badge ${session.sessionType === 'live' ? 'type-live' : 'type-guided'}`;
    }

    if (els.modalSessionTitle) {
        els.modalSessionTitle.textContent = session.dateFormatted;
    }

    const durStr = formatDuration(session.durationSec);
    const brStr = session.avgBreathingRate != null ? `${session.avgBreathingRate} BR/min` : 'Not available';
    const prStr = session.avgPulseRate != null ? `${session.avgPulseRate} BPM` : 'Not available';

    const modalityDesc = session.sessionType === 'live'
        ? 'Live Physiological Sensing: optical contactless sensing via Presage SmartSpectra native SDK.'
        : 'Guided Breathing Session: deterministic 4-2-6 rhythmic guidance. No optical cameras or biometric sensors were engaged; vitals were not measured.';

    if (els.sessionModalBody) {
        els.sessionModalBody.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Session Date</span>
                    <span class="detail-val">${session.dateFormatted}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Duration</span>
                    <span class="detail-val">${durStr}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Breathing Rate</span>
                    <span class="detail-val">${brStr}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pulse Rate</span>
                    <span class="detail-val">${prStr}</span>
                </div>
            </div>

            <div class="detail-section-box">
                <span class="detail-box-title">
                    <span>${session.sessionType === 'live' ? '📹' : '🍃'}</span>
                    <span>Modality & Sensor Context</span>
                </span>
                <p class="detail-box-desc">${modalityDesc}</p>
                <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
                    Completion Status: <strong style="color: var(--accent-mint);">${session.completionStatus}</strong> • Record ID: ${session.id}
                </div>
            </div>

            <div class="session-notes-wrap">
                <label class="session-notes-label" for="modal-session-notes">Session Reflection / Notes</label>
                <textarea id="modal-session-notes" class="session-notes-area" placeholder="Add an optional reflection or note about this session...">${session.notes || ''}</textarea>
                <button type="button" class="btn-save-notes" id="btn-save-modal-notes">Save Note</button>
            </div>
        `;

        const btnSaveNotes = document.getElementById('btn-save-modal-notes');
        const notesArea = document.getElementById('modal-session-notes');
        if (btnSaveNotes && notesArea) {
            btnSaveNotes.addEventListener('click', () => {
                const noteText = notesArea.value.trim();
                const history = loadSessionHistory();
                const rec = history.find(item => item.id === sessionId || (item.date && new Date(item.date).getTime() === sessionId));
                if (rec) {
                    rec.notes = noteText;
                    saveSessionHistory(history);
                    btnSaveNotes.textContent = 'Saved ✓';
                    setTimeout(() => { if (btnSaveNotes) btnSaveNotes.textContent = 'Save Note'; }, 1500);
                }
            });
        }
    }
}

/** Closes the Session Details Modal */
function closeSessionDetailModal() {
    if (els.sessionDetailModal) {
        els.sessionDetailModal.hidden = true;
    }
    activeModalSessionId = null;
}

/** Exports Session History to JSON without fabrication */
function exportSessionHistoryJson() {
    const rawHistory = loadSessionHistory();
    const payload = {
        app: 'VYTA',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalSessions: rawHistory.length,
        sessions: rawHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyta-session-history-${getLocalDateKey(new Date()) || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Updates Hero insight card on Overview */
function updateLastSessionInsight(lastEntry) {
    if (!els.insightLastSessionText) return;
    const history = lastEntry ? [lastEntry] : loadSessionHistory();
    const normalized = history.map(normalizeSession).filter(Boolean);
    if (normalized.length === 0) {
        els.insightLastSessionText.textContent = 'No previous session recorded yet';
        return;
    }
    const item = normalized[0];
    const durStr = formatDuration(item.durationSec);
    const typeLabel = item.sessionType === 'live' ? 'Live Sensing' : 'Guided';
    const brStr = item.avgBreathingRate ? `${item.avgBreathingRate} BR/min` : typeLabel;
    els.insightLastSessionText.innerHTML = `<strong>${item.dateFormatted}</strong><br>${durStr} • ${brStr}`;
}

function initSessionHistoryEvents() {
    // Calendar Navigation
    if (els.btnCalPrev) {
        els.btnCalPrev.addEventListener('click', () => {
            calendarViewingDate.setMonth(calendarViewingDate.getMonth() - 1);
            const rawHistory = loadSessionHistory();
            const normalized = rawHistory.map(normalizeSession).filter(Boolean);
            renderPracticeCalendar(normalized);
        });
    }

    if (els.btnCalNext) {
        els.btnCalNext.addEventListener('click', () => {
            calendarViewingDate.setMonth(calendarViewingDate.getMonth() + 1);
            const rawHistory = loadSessionHistory();
            const normalized = rawHistory.map(normalizeSession).filter(Boolean);
            renderPracticeCalendar(normalized);
        });
    }

    if (els.btnClearDateFilter) {
        els.btnClearDateFilter.addEventListener('click', () => {
            selectedDateFilter = null;
            renderSessionHistory();
        });
    }

    if (els.btnResetFilter) {
        els.btnResetFilter.addEventListener('click', () => {
            selectedDateFilter = null;
            renderSessionHistory();
        });
    }

    // Export History
    if (els.btnExportHistory) {
        els.btnExportHistory.addEventListener('click', exportSessionHistoryJson);
    }
    if (els.btnExportData) {
        els.btnExportData.addEventListener('click', exportSessionHistoryJson);
    }

    // Clear History
    if (els.btnClearHistory) {
        els.btnClearHistory.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all recorded VYTA session history? This action cannot be undone.')) {
                localStorage.removeItem(HISTORY_STORAGE_KEY);
                selectedDateFilter = null;
                renderSessionHistory();
                updateLastSessionInsight();
            }
        });
    }

    // Modal Events
    if (els.btnModalClose) {
        els.btnModalClose.addEventListener('click', closeSessionDetailModal);
    }
    if (els.btnModalDone) {
        els.btnModalDone.addEventListener('click', closeSessionDetailModal);
    }
    if (els.sessionModalBackdrop) {
        els.sessionModalBackdrop.addEventListener('click', closeSessionDetailModal);
    }
    if (els.btnModalDelete) {
        els.btnModalDelete.addEventListener('click', () => {
            if (activeModalSessionId != null) {
                if (confirm('Delete this session record?')) {
                    deleteSessionById(activeModalSessionId);
                }
            }
        });
    }

    // Keyboard ESC to close modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.sessionDetailModal && !els.sessionDetailModal.hidden) {
            closeSessionDetailModal();
        }
    });
}

// Session State Management & UI Controls -------------------------------------

function setTogglesEnabled(enabled) {
    els.cardioToggle.disabled = !enabled;
    els.faceToggle.disabled = !enabled;
}

function updateUIForState(state) {
    currentState = state;
    console.log(`[VYTA State] -> ${state}`);

    // Update status badge
    if (els.statusBadge) {
        const badgeLabel = STATUS_NAMES[state] || state;
        els.statusBadge.textContent = badgeLabel;
        els.statusBadge.className = `status status-${badgeLabel.toLowerCase()}`;
    }

    // Update top sensor status pill
    if (els.sensorStatusText && els.sensorPill) {
        switch (state) {
            case SessionState.IDLE:
                els.sensorStatusText.textContent = 'Sensor Ready';
                els.sensorPill.className = 'sensor-pill sensor-ready';
                break;
            case SessionState.ACQUIRING_CAMERA:
                els.sensorStatusText.textContent = 'Initializing Camera…';
                els.sensorPill.className = 'sensor-pill sensor-warn';
                break;
            case SessionState.VERIFYING_CAMERA:
                els.sensorStatusText.textContent = 'Verifying Frame Rate…';
                els.sensorPill.className = 'sensor-pill sensor-warn';
                break;
            case SessionState.STARTING_SDK:
                els.sensorStatusText.textContent = 'Connecting SDK…';
                els.sensorPill.className = 'sensor-pill sensor-warn';
                break;
            case SessionState.RUNNING:
                els.sensorStatusText.textContent = 'Live Sensing Active';
                els.sensorPill.className = 'sensor-pill sensor-ready';
                startSessionTimer();
                break;
            case SessionState.STOPPING:
                els.sensorStatusText.textContent = 'Stopping…';
                els.sensorPill.className = 'sensor-pill sensor-warn';
                stopSessionTimer(true);
                break;
        }
    }

    // Hero CTA update
    if (els.btnHeroStart) {
        if (state === SessionState.RUNNING) {
            els.btnHeroStart.innerHTML = '<span>Viewing Live Session</span> <span class="btn-arrow">→</span>';
        } else {
            els.btnHeroStart.innerHTML = '<span>Begin Session</span> <span class="btn-arrow">→</span>';
        }
    }

    switch (state) {
        case SessionState.IDLE:
            els.btnStart.disabled = false;
            els.btnStop.disabled = true;
            els.btnReset.disabled = false;
            setTogglesEnabled(true);
            break;
        case SessionState.ACQUIRING_CAMERA:
        case SessionState.VERIFYING_CAMERA:
        case SessionState.STARTING_SDK:
            els.btnStart.disabled = true;
            els.btnStop.disabled = true;
            els.btnReset.disabled = true;
            setTogglesEnabled(false);
            break;
        case SessionState.RUNNING:
            els.btnStart.disabled = true;
            els.btnStop.disabled = false;
            els.btnReset.disabled = false;
            setTogglesEnabled(false);
            break;
        case SessionState.STOPPING:
            els.btnStart.disabled = true;
            els.btnStop.disabled = true;
            els.btnReset.disabled = true;
            setTogglesEnabled(false);
            break;
    }
}

// Error Classification & Actionable Guidance ---------------------------------

function classifyCameraError(err) {
    const name = err?.name || 'CameraError';
    let message = err?.message || 'Unknown camera error';
    let code = 'CAMERA';

    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            code = 'PERM_DENIED';
            message = 'Camera permission denied. Please allow camera access in Windows Settings (Privacy & security -> Camera).';
            break;
        case 'NotReadableError':
        case 'TrackStartError':
            code = 'CAM_BUSY';
            message = 'Webcam is currently locked or in use by another application (e.g. Teams, Zoom, or Windows Camera). Close other applications and retry.';
            break;
        case 'OverconstrainedError':
            code = 'OVERCONSTRAINED';
            message = `Camera does not support the requested configuration (640x480 @ >=25 FPS). Constraint: "${err.constraint || 'unknown'}".`;
            break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            code = 'CAM_NOT_FOUND';
            message = 'No webcam was detected. Please verify your USB webcam is connected and recognized in Windows Device Manager.';
            break;
        case 'AbortError':
            code = 'ABORT';
            message = 'Camera acquisition was aborted by the hardware driver or operating system. Please reconnect your webcam.';
            break;
        default:
            code = name;
            message = `${name}: ${err?.message || 'Camera error'}`;
            break;
    }

    return { code, message, originalError: err };
}

function explainFrameRateIssue(fpsReport) {
    const fps = fpsReport?.rollingFps ?? fpsReport?.measuredFps ?? 'unknown';
    const formattedFps = typeof fps === 'number' ? fps.toFixed(1) : fps;
    return {
        code: 'FRAME_RATE_LOW',
        message: `Camera is running slow (${formattedFps} FPS, minimum 25 FPS required). Increase room lighting or pick another camera.`,
    };
}

// Camera Lifecycle Management ------------------------------------------------

function stopAllCameraResources() {
    if (fpsMonitorCleanup) {
        try {
            if (typeof fpsMonitorCleanup === 'function') fpsMonitorCleanup();
            else if (typeof fpsMonitorCleanup.stop === 'function') fpsMonitorCleanup.stop();
        } catch { /* ignore */ }
        fpsMonitorCleanup = null;
    }
    if (activeStream) {
        for (const track of activeStream.getTracks()) {
            try {
                track.onended = null;
                track.stop();
            } catch { /* already stopped */ }
        }
        activeStream = null;
    }
    if (activeBoostedStream) {
        try { activeBoostedStream.stop(); } catch { /* ignore */ }
        activeBoostedStream = null;
    }
    if (els.preview) {
        els.preview.srcObject = null;
    }
}

let activeSessionEpoch = 0;
let isOperationInProgress = false;

async function stopSession() {
    if (currentState === SessionState.STOPPING || currentState === SessionState.IDLE) {
        return;
    }
    updateUIForState(SessionState.STOPPING);
    activeSessionEpoch++;

    if (fpsMonitorCleanup) {
        try { fpsMonitorCleanup.stop(); } catch {}
        fpsMonitorCleanup = null;
    }

    try {
        if (sdk && sdk.processingStatus !== ProcessingStatus.kIdle && sdk.processingStatus !== ProcessingStatus.kUninitialized) {
            await sdk.stop();
        }
    } catch (err) {
        console.warn('[VYTA] sdk.stop() warning:', err);
    } finally {
        stopAllCameraResources();
        updateUIForState(SessionState.IDLE);
        if (els.errorBanner.hidden) {
            els.validation.innerHTML = 'Session stopped. Click <strong>Start</strong> when ready.';
            els.validation.className = 'hint';
        } else {
            // When an error halted the session, clear stale in-flight validation hints (e.g. Chest Obscured)
            const retryNote = lastErrorDetails?.retryable ? ' Click <strong>Start</strong> to retry.' : '';
            els.validation.innerHTML = `Session halted due to error: <strong>${els.errorCode.textContent}</strong>.${retryNote}`;
            els.validation.className = 'hint hint-err';
        }
        if (els.facialLumBadge) {
            els.facialLumBadge.hidden = true;
        }
    }
}

/**
 * Acquires a camera stream using the device selected in the picker.
 *
 * Constraints (safe, no manual exposure):
 *   - deviceId: exact (from picker / localStorage, falls back to any camera)
 *   - width: ideal 1280, height: ideal 720  (downscales gracefully to 640×480)
 *   - frameRate: ideal 30  (no "exact" or "min" — lets auto-exposure breathe)
 *   - facingMode: user  (advisory only, omitted when deviceId is exact)
 *
 * Manual exposure, exposureMode, and exposureTime are intentionally NOT set.
 * Forcing exposureMode:'manual' + exposureTime:39ms causes the sensor to
 * deliver a pitch-black image on most laptop webcams in normal room light.
 * The camera's automatic exposure produces a correctly exposed image at 30 FPS.
 */
async function acquireCameraStream() {
    stopAllCameraResources();
    currentCameraStatus = 'CHECKING';

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        currentCameraStatus = 'FAILED';
        throw { code: 'NO_MEDIA_DEVICES', message: 'navigator.mediaDevices.getUserMedia is unavailable in this context.' };
    }

    // Ensure the picker has the latest device list (labels need a prior grant).
    const selectedDeviceId = await populateCameraList();

    const videoConstraints = {
        width:  { ideal: 1280 },
        height: { ideal: 720  },
        frameRate: { ideal: 30 },
    };

    // Add deviceId constraint only when a specific camera has been chosen.
    // Using { exact: id } tells the browser to reject any other device.
    if (selectedDeviceId) {
        videoConstraints.deviceId = { exact: selectedDeviceId };
    } else {
        // No specific device — prefer the user-facing camera.
        videoConstraints.facingMode = 'user';
    }

    console.log('[VYTA Camera] Requesting stream with constraints:', JSON.stringify(videoConstraints));

    let stream = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            lastError = null;
            break;
        } catch (err) {
            lastError = err;
            if ((err.name === 'NotReadableError' || err.name === 'TrackStartError') && attempt < 2) {
                console.warn(`[VYTA Camera] Device busy (attempt ${attempt + 1}), retrying in 600ms…`);
                await new Promise(r => setTimeout(r, 600));
                continue;
            }
            // If exact deviceId was rejected, fall back without deviceId constraint.
            if (err.name === 'OverconstrainedError' && selectedDeviceId) {
                console.warn('[VYTA Camera] Exact deviceId constraint rejected — falling back to any camera.');
                try {
                    const fallbackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' };
                    stream = await navigator.mediaDevices.getUserMedia({ video: fallbackConstraints });
                    lastError = null;
                } catch (fallbackErr) {
                    lastError = fallbackErr;
                }
            }
            break;
        }
    }

    if (!stream) {
        currentCameraStatus = 'FAILED';
        console.warn('[VYTA Camera] getUserMedia failed:', lastError?.name, lastError?.message);
        throw classifyCameraError(lastError);
    }

    const track = stream.getVideoTracks()[0];
    if (!track) {
        currentCameraStatus = 'FAILED';
        for (const t of stream.getTracks()) t.stop();
        throw { code: 'NO_TRACKS', message: 'getUserMedia returned a stream with no video tracks.' };
    }

    // Apply 30 FPS Lock if enabled: locks manual exposure to 39.0625ms to prevent
    // low-light frame-rate drops down to 7 FPS, keeping the camera at a crisp 30 FPS.
    const lock30Fps = els.fpsLockToggle ? els.fpsLockToggle.checked : true;
    if (lock30Fps) {
        const supported = (typeof navigator.mediaDevices.getSupportedConstraints === 'function')
            ? navigator.mediaDevices.getSupportedConstraints()
            : {};
        const capabilities = (typeof track.getCapabilities === 'function') ? track.getCapabilities() : {};

        const canSetExposureMode = supported.exposureMode &&
            Array.isArray(capabilities.exposureMode) &&
            capabilities.exposureMode.includes('manual');
        const canSetExposureTime = supported.exposureTime &&
            capabilities.exposureTime &&
            typeof capabilities.exposureTime === 'object';

        if (canSetExposureMode || canSetExposureTime) {
            const advanced = {};
            if (canSetExposureMode) advanced.exposureMode = 'manual';
            if (canSetExposureTime) {
                const minExp = capabilities.exposureTime.min ?? 0;
                const maxExp = capabilities.exposureTime.max ?? 10000;
                let targetExp = 39.0625;
                if (targetExp < minExp) targetExp = minExp;
                if (targetExp > maxExp) targetExp = maxExp;
                advanced.exposureTime = targetExp;
            }
            try {
                await track.applyConstraints({ advanced: [advanced] });
                console.log('[VYTA Camera] Applied Lock 30 FPS mode constraints:', advanced);
            } catch (applyErr) {
                console.warn('[VYTA Camera] Hardware driver rejected exposure constraints, continuing with auto:', applyErr.message);
            }
        }
    }

    // Log and show the actual camera settings immediately after acquisition.
    const activeSettings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    console.log('[VYTA Camera] Active track settings:', {
        label:        track.label,
        width:        activeSettings.width,
        height:       activeSettings.height,
        frameRate:    activeSettings.frameRate,
        exposureMode: activeSettings.exposureMode,
        exposureTime: activeSettings.exposureTime,
        deviceId:     (activeSettings.deviceId ?? '').slice(0, 12),
    });

    // Show initial debug panel values (live FPS will be filled in by verifyCameraFps).
    updateDebugPanel(track, undefined);

    // Refresh picker labels now that we have permission (labels become visible
    // after the first getUserMedia grant).
    await populateCameraList();

    // Wire up disconnect handler.
    track.onended = () => {
        console.warn('[VYTA Camera] Track ended unexpectedly.');
        currentCameraStatus = 'FAILED';
        if (currentState === SessionState.RUNNING || currentState === SessionState.STARTING_SDK) {
            els.errorBanner.hidden = false;
            els.errorCode.textContent    = 'CAM_DISCONNECTED';
            els.errorMessage.textContent = 'Camera disconnected or stopped by the system.';
            stopSession();
        }
    };

    return stream;
}

// Software Gain Pipeline ------------------------------------------------------

/**
 * Creates a software-amplified clone of the camera stream using
 * MediaStreamTrackProcessor + OffscreenCanvas + MediaStreamTrackGenerator.
 *
 * Each raw video frame is drawn to a 640x480 OffscreenCanvas, the pixel data
 * is multiplied by `gainFactor` (clamped to 0-255), and the boosted frame is
 * pushed into a synthetic MediaStreamTrackGenerator.  The returned MediaStream
 * is safe to pass to instance.useMediaStream() while the original raw stream
 * continues to drive the preview element and the diagnostics canvas.
 *
 * Returns null if the required APIs (MediaStreamTrackProcessor /
 * MediaStreamTrackGenerator / OffscreenCanvas / VideoFrame) are unavailable,
 * in which case the caller must fall back to the raw stream.
 *
 * @param {MediaStream} rawStream  - Original camera stream (not consumed here).
 * @param {number}      gainFactor - Linear pixel multiplier applied before clamp (default 3.5).
 * @returns {{ boostedStream: MediaStream, stop: () => void } | null}
 */
function createSoftwareGainPipeline(rawStream, gainFactor = 3.5) {
    try {
        const rawTrack = rawStream.getVideoTracks()[0];
        if (!rawTrack) return null;

        // Check API availability (Chromium / Electron 22+).
        if (typeof MediaStreamTrackProcessor === 'undefined' ||
            typeof MediaStreamTrackGenerator === 'undefined') {
            console.warn('[VYTA Gain] MediaStreamTrackProcessor/Generator unavailable – falling back to raw stream.');
            return null;
        }

        const settings = typeof rawTrack.getSettings === 'function' ? rawTrack.getSettings() : {};
        const W = settings.width  || 640;
        const H = settings.height || 480;

        // GPU-composited brightness amplification via canvas filter.
        // Avoids per-pixel getImageData/putImageData round-trips so the pipeline
        // keeps up with the 30 FPS camera stream.
        const brightnessPercent = Math.round(gainFactor * 100);

        const clonedTrack = rawTrack.clone();
        const processor  = new MediaStreamTrackProcessor({ track: clonedTrack });
        const generator  = new MediaStreamTrackGenerator({ kind: 'video' });

        const offscreen  = new OffscreenCanvas(W, H);
        const ctx        = offscreen.getContext('2d');
        ctx.filter       = `brightness(${brightnessPercent}%)`;

        let pipelineActive = true;
        let reader = null;
        let writer = null;

        (async () => {
            try {
                reader = processor.readable.getReader();
                writer = generator.writable.getWriter();
                while (pipelineActive) {
                    const { done, value: frame } = await reader.read();
                    if (done || !pipelineActive) {
                        if (frame) frame.close();
                        break;
                    }

                    // Single GPU-composited draw with brightness filter — no pixel loop.
                    ctx.drawImage(frame, 0, 0, W, H);

                    const boostedFrame = new VideoFrame(offscreen, {
                        timestamp: frame.timestamp,
                    });
                    frame.close();

                    try {
                        await writer.write(boostedFrame);
                    } catch {
                        boostedFrame.close();
                        break;
                    }
                }
            } catch (pipelineErr) {
                console.warn('[VYTA Gain] Pipeline error:', pipelineErr?.message);
            } finally {
                if (reader) {
                    try { await reader.cancel().catch(() => {}); } catch { /* ignore */ }
                    try { reader.releaseLock(); } catch { /* ignore */ }
                }
                if (writer) {
                    try { await writer.close().catch(() => {}); } catch { /* ignore */ }
                    try { writer.releaseLock(); } catch { /* ignore */ }
                }
            }
        })();

        const boostedStream = new MediaStream([generator]);

        return {
            boostedStream,
            stop: () => {
                pipelineActive = false;
                try { clonedTrack.stop(); } catch { /* ignore */ }
                try { generator.stop(); } catch { /* ignore */ }
            },
        };
    } catch (gainErr) {
        console.warn('[VYTA Gain] createSoftwareGainPipeline failed, using raw stream:', gainErr?.message);
        return null;
    }
}

// FPS Measurement Helpers (Pre-flight & Continuous) --------------------------

/**
 * Pre-flight verification: counts delivered video frames over a ~1.8s warm-up window
 * via MediaStreamTrackProcessor to confirm the hardware camera actually delivers >= 25 FPS
 * before handing the stream to the SmartSpectra SDK.
 */
function verifyCameraFps(stream, durationMs = 1800) {
    return new Promise((resolve) => {
        const track = stream?.getVideoTracks()?.[0];
        if (!track) {
            resolve({ measuredFps: 0, framesDelivered: 0, meetsMinimumFps: false });
            return;
        }

        let frameCount = 0;
        let active = true;
        let clonedTrack = null;
        let processor = null;
        let reader = null;
        const start = performance.now();

        try {
            clonedTrack = track.clone();
            processor = new MediaStreamTrackProcessor({ track: clonedTrack });
            reader = processor.readable.getReader();

            (async () => {
                try {
                    while (active) {
                        const { done, value } = await reader.read();
                        if (done || !active) {
                            if (value) value.close();
                            break;
                        }
                        frameCount++;
                        value.close();
                    }
                } catch {
                    /* stopped */
                }
            })();
        } catch (e) {
            console.warn('[VYTA] verifyCameraFps processor error:', e.message);
        }

        setTimeout(() => {
            active = false;
            if (reader) {
                try { reader.cancel().catch(() => {}); } catch { /* ignore */ }
                reader = null;
            }
            if (clonedTrack) {
                try { clonedTrack.stop(); } catch { /* ignore */ }
                clonedTrack = null;
            }
            const elapsed = (performance.now() - start) / 1000;
            const measuredFps = elapsed > 0 ? (frameCount / elapsed) : 0;
            const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};

            resolve({
                measuredFps: Number(measuredFps.toFixed(2)),
                framesDelivered: frameCount,
                durationSec: Number(elapsed.toFixed(2)),
                meetsMinimumFps: measuredFps >= 25.0,
                exposureMode: settings.exposureMode,
                exposureTime: settings.exposureTime,
                settings,
            });
        }, durationMs);
    });
}

/**
 * Continuous FPS monitor: runs during the active RUNNING session.
 * Tracks delivered frames via requestVideoFrameCallback and SDK frame callbacks,
 * maintaining a 2-second sliding window to detect frame rate drops.
 */
function startContinuousFpsMonitor(videoEl, onFpsReport, onFpsWarning) {
    let active = true;
    let rvfcHandle = null;
    const frameTimestamps = [];
    let totalFrames = 0;
    let lastFrameTime = 0;
    const sessionStart = performance.now();
    let consecutiveLowFpsCount = 0;

    function registerFrame(timeMs) {
        if (!active) return;
        // Debounce frames arriving within 15ms to prevent double-counting across RVFC and SDK
        if (timeMs - lastFrameTime < 15) return;
        lastFrameTime = timeMs;
        totalFrames++;
        frameTimestamps.push(timeMs);

        const cutoff = timeMs - 2000;
        while (frameTimestamps.length > 0 && frameTimestamps[0] < cutoff) {
            frameTimestamps.shift();
        }
    }

    function rvfcCallback(now) {
        if (!active) return;
        registerFrame(now);
        if (active && typeof videoEl.requestVideoFrameCallback === 'function') {
            rvfcHandle = videoEl.requestVideoFrameCallback(rvfcCallback);
        }
    }

    if (typeof videoEl.requestVideoFrameCallback === 'function') {
        rvfcHandle = videoEl.requestVideoFrameCallback(rvfcCallback);
    }

    // Live facial-region brightness diagnostic using downscaled 160x120 offscreen canvas
    // Runs inside the existing 1s monitor timer (< 0.2ms per sample, no competing loop)
    let diagCanvas = null;
    let diagCtx = null;
    let currentFacialLum = null;
    let currentFacialMetrics = null;
    let currentLowResGrid = null;
    try {
        diagCanvas = document.createElement('canvas');
        diagCanvas.width = 160;
        diagCanvas.height = 120;
        diagCtx = diagCanvas.getContext('2d', { willReadFrequently: true });
    } catch { /* offscreen fallback */ }

    if (els.facialLumBadge) els.facialLumBadge.hidden = false;

    const intervalTimer = setInterval(() => {
        if (!active) return;
        const now = performance.now();
        const totalDurationSec = (now - sessionStart) / 1000;

        let rollingFps = 0;
        if (frameTimestamps.length >= 2) {
            const windowDurationSec = (frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0]) / 1000;
            if (windowDurationSec > 0.3) {
                rollingFps = (frameTimestamps.length - 1) / windowDurationSec;
            }
        }

        const overallFps = totalDurationSec > 0 ? (totalFrames / totalDurationSec) : 0;
        const track = activeStream?.getVideoTracks()?.[0];
        const settings = track?.getSettings ? track.getSettings() : {};
        const readyState = track?.readyState || 'none';

        // Sample facial-region brightness safely once per second without competing loop
        if (diagCtx && videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            try {
                diagCtx.drawImage(videoEl, 0, 0, 160, 120);
                const fullFrame = diagCtx.getImageData(0, 0, 160, 120).data;

                // 1. Calculate whole-frame spatial variance to detect camera occlusion/closed shutter
                let totalY = 0;
                let totalSqY = 0;
                let totalN = 0;
                for (let i = 0; i < fullFrame.length; i += 16) {
                    const y = 0.299 * fullFrame[i] + 0.587 * fullFrame[i + 1] + 0.114 * fullFrame[i + 2];
                    totalY += y;
                    totalSqY += (y * y);
                    totalN++;
                }
                const frameMean = totalN > 0 ? (totalY / totalN) : 0;
                const frameVar = totalN > 0 ? Math.max(0, (totalSqY / totalN) - (frameMean * frameMean)) : 0;
                const frameStdDev = Math.sqrt(frameVar);
                const isOccluded = frameStdDev < 1.0;

                // 2. Anonymized 16x12 low-resolution spatial grid for offline illumination proof
                const grid = [];
                for (let gy = 0; gy < 12; gy++) {
                    const row = [];
                    for (let gx = 0; gx < 16; gx++) {
                        let bSum = 0;
                        let bCount = 0;
                        for (let py = gy * 10; py < (gy + 1) * 10; py += 3) {
                            for (let px = gx * 10; px < (gx + 1) * 10; px += 3) {
                                const idx = (py * 160 + px) * 4;
                                bSum += (0.299 * fullFrame[idx] + 0.587 * fullFrame[idx + 1] + 0.114 * fullFrame[idx + 2]);
                                bCount++;
                            }
                        }
                        row.push(bCount > 0 ? Math.round(bSum / bCount) : 0);
                    }
                    grid.push(row);
                }
                currentLowResGrid = grid;

                // 3. Determine Face ROI coordinates
                // If scene has real variance (not occluded), adaptively find skin/face centroid
                let roiX = 40, roiY = 15, roiW = 80, roiH = 75; // default center zone
                if (!isOccluded) {
                    let skinSumX = 0, skinSumY = 0, skinCount = 0;
                    for (let y = 10; y < 100; y += 2) {
                        for (let x = 20; x < 140; x += 2) {
                            const idx = (y * 160 + x) * 4;
                            const r = fullFrame[idx];
                            const g = fullFrame[idx + 1];
                            const b = fullFrame[idx + 2];
                            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                            if (lum >= 25 && lum <= 235 && r >= g && g >= (b - 15) && (r - b) >= 8) {
                                skinSumX += x;
                                skinSumY += y;
                                skinCount++;
                            }
                        }
                    }
                    if (skinCount > 80) {
                        const cx = Math.round(skinSumX / skinCount);
                        const cy = Math.round(skinSumY / skinCount);
                        roiX = Math.max(0, Math.min(160 - 70, cx - 35));
                        roiY = Math.max(0, Math.min(120 - 70, cy - 35));
                        roiW = 70;
                        roiH = 70;
                    }
                }

                // 4. Extract ROI pixel statistics & percentiles (p10, median, p90, min, max, stdDev)
                const roiData = diagCtx.getImageData(roiX, roiY, roiW, roiH).data;
                const lums = [];
                let roiSum = 0;
                let roiSumSq = 0;
                for (let i = 0; i < roiData.length; i += 16) {
                    const y = 0.299 * roiData[i] + 0.587 * roiData[i + 1] + 0.114 * roiData[i + 2];
                    lums.push(y);
                    roiSum += y;
                    roiSumSq += (y * y);
                }

                lums.sort((a, b) => a - b);
                const M = lums.length;
                const meanY = M > 0 ? (roiSum / M) : 0;
                const roiVar = M > 0 ? Math.max(0, (roiSumSq / M) - (meanY * meanY)) : 0;
                const roiStdDev = Math.sqrt(roiVar);
                const p10 = M > 0 ? lums[Math.floor(M * 0.10)] : 0;
                const median = M > 0 ? lums[Math.floor(M * 0.50)] : 0;
                const p90 = M > 0 ? lums[Math.floor(M * 0.90)] : 0;
                const min = M > 0 ? lums[0] : 0;
                const max = M > 0 ? lums[M - 1] : 0;

                currentFacialMetrics = {
                    mean: Number(meanY.toFixed(1)),
                    median: Number(median.toFixed(1)),
                    p10: Number(p10.toFixed(1)),
                    p90: Number(p90.toFixed(1)),
                    dynamicRange: Number((p90 - p10).toFixed(1)),
                    min: Number(min.toFixed(1)),
                    max: Number(max.toFixed(1)),
                    stdDev: Number(roiStdDev.toFixed(2)),
                    frameStdDev: Number(frameStdDev.toFixed(2)),
                    isOccluded,
                    roi: { x: roiX, y: roiY, width: roiW, height: roiH },
                };
                currentFacialLum = currentFacialMetrics.mean;

                if (els.lumValue && els.facialLumBadge) {
                    const dynamicRange = p90 - p10;
                    if (isOccluded || frameStdDev < 2.0) {
                        els.lumValue.textContent = `Closed/Dark (stdDev ${frameStdDev.toFixed(1)})`;
                        els.facialLumBadge.className = 'lum-badge lum-err';
                    } else if (dynamicRange < 12 || frameStdDev < 5.0 || meanY < 25) {
                        els.lumValue.textContent = `Underexposed (${meanY.toFixed(0)} Y | Need Light)`;
                        els.facialLumBadge.className = 'lum-badge lum-err';
                    } else if (latestValidationCode === ValidationCode.kTooDark) {
                        els.lumValue.textContent = `${meanY.toFixed(1)} Y (Too Dark | range:${dynamicRange.toFixed(0)})`;
                        els.facialLumBadge.className = 'lum-badge lum-err';
                    } else {
                        let level = 'ok';
                        let label = 'Good';
                        if (meanY < 40 || p10 < 25 || dynamicRange < 20) {
                            level = 'warn';
                            label = 'Dim';
                        }
                        els.lumValue.textContent = `${meanY.toFixed(1)} Y (${label} | range:${dynamicRange.toFixed(0)})`;
                        els.facialLumBadge.className = `lum-badge lum-${level}`;
                    }
                }
            } catch { /* ignore capture error */ }
        }

        const report = {
            rollingFps: Number(rollingFps.toFixed(2)),
            overallFps: Number(overallFps.toFixed(2)),
            totalFrames,
            sessionDurationSec: Number(totalDurationSec.toFixed(2)),
            readyState,
            exposureMode: settings.exposureMode ?? 'unknown',
            exposureTime: settings.exposureTime ?? 'unknown',
            width: settings.width,
            height: settings.height,
            facialLuminance: currentFacialLum,
            facialMetrics: currentFacialMetrics,
            meetsMinimumFps: rollingFps >= 25.0 || (totalFrames > 15 && overallFps >= 25.0),
        };

        if (typeof onFpsReport === 'function') {
            onFpsReport(report);
        }

        if (totalDurationSec > 3.0 && rollingFps < 24.5 && overallFps < 25.0 && rollingFps > 0) {
            consecutiveLowFpsCount++;
            if (consecutiveLowFpsCount >= 3 && typeof onFpsWarning === 'function') {
                onFpsWarning(report);
            }
        } else {
            consecutiveLowFpsCount = 0;
        }
    }, 1000);

    return {
        stop: () => {
            active = false;
            clearInterval(intervalTimer);
            if (rvfcHandle !== null && typeof videoEl.cancelVideoFrameCallback === 'function') {
                try { videoEl.cancelVideoFrameCallback(rvfcHandle); } catch { /* ignore */ }
                rvfcHandle = null;
            }
            if (els.facialLumBadge) els.facialLumBadge.hidden = true;
            diagCanvas = null;
            diagCtx = null;
        },
        recordSdkFrame: (tsUs) => {
            registerFrame(performance.now());
        },
        getFacialLuminance: () => currentFacialLum,
        getFacialMetrics: () => currentFacialMetrics,
        getLowResGrid: () => currentLowResGrid,
    };
}

// SDK Construction & Event Handlers ------------------------------------------

// SDK Construction & Event Handlers ------------------------------------------

function ensureAuthoritativeSdk() {
    if (sdk) return sdk;

    const requested = readRequestedMetrics();
    console.log('[VYTA] Initializing authoritative SmartSpectraSDK instance, requestedMetrics =', requested);

    sdk = new SmartSpectraSDK({
        apiKey: API_KEY,
        requestedMetrics: requested,
        enableTelemetry: false,
        enableAccumulatedOutput: false,
    });

    sdk.on('processingStatus', (status) => {
        const label = STATUS_NAMES[status] || `Status(${status})`;
        console.log(`[sample] processingStatus -> ${label} (${status})`);
        els.statusBadge.textContent = label;
        els.statusBadge.className = `status status-${label.toLowerCase()}`;

        if (status === ProcessingStatus.kRunning) {
            updateUIForState(SessionState.RUNNING);
        } else if (status === ProcessingStatus.kStopping) {
            updateUIForState(SessionState.STOPPING);
        } else if (status === ProcessingStatus.kIdle) {
            if (currentState === SessionState.STOPPING) {
                updateUIForState(SessionState.IDLE);
            }
        } else if (status === ProcessingStatus.kError) {
            els.errorBanner.hidden = false;
            // Preserve the specific SDK error code/name/message if already set by sdk.on('error')!
            if (!lastErrorDetails) {
                lastErrorDetails = {
                    code: 'STATUS_ERR',
                    name: 'STATUS_ERR',
                    message: 'SmartSpectra entered error state.',
                    retryable: true,
                };
                els.errorCode.textContent = 'STATUS_ERR';
                els.errorMessage.textContent = 'SmartSpectra entered error state.';
            }
            stopSession();
        }
    });

    sdk.on('validationStatus', (code, timestampUs, hint) => {
        if (currentState === SessionState.IDLE || currentState === SessionState.STOPPING) return;
        latestValidationCode = code;
        const info = VALIDATION_GUIDANCE[code];
        const title = info?.title || VALIDATION_NAMES[code] || `Code(${code})`;
        let guidance = info?.guidance || hint || '';
        const type = info?.type || (code === ValidationCode.kOk ? 'ok' : code === ValidationCode.kCameraTuning ? 'warn' : 'err');

        const metrics = fpsMonitorCleanup?.getFacialMetrics?.();
        if (code === ValidationCode.kTooDark && (metrics?.isOccluded || (metrics?.frameStdDev ?? 10) < 2.0)) {
            guidance = 'Webcam privacy shutter appears closed or lens is covered. Open the physical shutter slider on your webcam.';
        }

        validationHistory.push({
            code,
            name: VALIDATION_NAMES[code] || `Code(${code})`,
            title,
            hint: hint || '',
            guidance,
            facialMetrics: metrics ? { ...metrics } : null,
            timestampUs: tsToNumber(timestampUs),
            wallClockIso: new Date().toISOString(),
        });

        console.log(`[sample] validationStatus ${title} (${code}) ts=${timestampUs} hint=${hint || '-'}`);
        if (guidance) {
            els.validation.innerHTML = `<strong>${title}</strong>: ${guidance}`;
        } else {
            els.validation.textContent = title;
        }
        els.validation.className = `hint hint-${type}`;

        // Keep shell sensor pill and overview insight synchronized
        if (code === ValidationCode.kOk) {
            if (els.insightQualityVal) els.insightQualityVal.textContent = 'Signal Optimal (30 FPS)';
            if (els.insightQualityTag) {
                els.insightQualityTag.textContent = 'Optimal';
                els.insightQualityTag.className = 'insight-badge quality-tag';
            }
            if (els.sensorStatusText && currentState === SessionState.RUNNING) {
                els.sensorStatusText.textContent = 'Signal Optimal';
                els.sensorPill.className = 'sensor-pill sensor-ready';
            }
        } else {
            if (els.insightQualityVal) els.insightQualityVal.textContent = title;
            if (els.insightQualityTag) {
                els.insightQualityTag.textContent = type === 'err' ? 'Check' : 'Adjusting';
                els.insightQualityTag.className = `insight-badge ${type === 'err' ? 'quality-err' : 'quality-warn'}`;
            }
            if (els.sensorStatusText && currentState === SessionState.RUNNING) {
                els.sensorStatusText.textContent = title;
                els.sensorPill.className = `sensor-pill ${type === 'err' ? 'sensor-err' : 'sensor-warn'}`;
            }
        }
    });

    sdk.on('metrics', (buf, timestampUs) => {
        if (currentState === SessionState.IDLE || currentState === SessionState.STOPPING) return;
        metricsCount++;
        try {
            const decoded = decodeMetrics(buf);

            const categories = [];
            if (decoded.breathing) categories.push('breathing');
            if (decoded.cardio) categories.push('cardio');
            if (decoded.face) categories.push('face');
            if (decoded.micromotion) categories.push('micromotion');
            if (decoded.eda) categories.push('eda');

            const brSamples = decoded.breathing?.rate || [];
            const traceSamples = decoded.breathing?.upperTrace || [];

            console.log(`[VYTA Diagnostic] Metrics event #${metricsCount} at ts=${timestampUs}µs:`);
            console.log(`  - Categories: [${categories.join(', ')}]`);
            console.log(`  - Breathing rate count: ${brSamples.length}, trace count: ${traceSamples.length}`);
            if (brSamples.length > 0) {
                const latestBr = brSamples[brSamples.length - 1];
                console.log(`  - Breathing rate latest: val=${latestBr.value} conf=${latestBr.confidence ?? '-'} ts=${latestBr.timestamp}`);
            }
            if (traceSamples.length > 0) {
                const latestTrace = traceSamples[traceSamples.length - 1];
                console.log(`  - Breathing trace latest: val=${latestTrace.value} ts=${latestTrace.timestamp}`);
            }

            handleMetrics(decoded);

            console.log(`  - Readout Breathing UI text: "${els.readoutBreathing.textContent}"`);
            console.log(`  - Chart dataset points (rate): ${charts.breathingRate.data.datasets[0].data.length}, (trace): ${charts.breathingTrace.data.datasets[0].data.length}`);
        } catch (e) {
            console.error(`[sample] failed to decode Metrics #${metricsCount} (${buf.byteLength}B ts=${timestampUs}):`, e);
        }
    });

    sdk.on('error', (code, message, retryable) => {
        const name = ERROR_CODE_NAMES[code] || `ERROR_${code}`;
        console.error(`[sample] error code=${code} (${name}) retryable=${retryable}: ${message}`);

        lastErrorDetails = { code, name, message, retryable: !!retryable };
        els.errorBanner.hidden = false;
        els.errorCode.textContent = `${name} (${code})`;

        if (code === SmartSpectraErrorCode.kProcessingFailed || message.includes('FrameRateTooLow')) {
            const track = activeStream?.getVideoTracks()?.[0];
            const s = track?.getSettings ? track.getSettings() : {};
            els.errorMessage.textContent = `FrameRateTooLow: camera is delivering < 25 FPS (exposure: ${s.exposureTime ?? 'unknown'}ms, mode: ${s.exposureMode ?? 'unknown'}). Increase room lighting.`;
        } else if (code === SmartSpectraErrorCode.kNetworkError || message.toLowerCase().includes('network')) {
            els.errorMessage.textContent = `${message || 'A network error occurred during SmartSpectra processing.'}${retryable ? ' (retryable — check internet connection and click Start)' : ''}`;
        } else if (code === SmartSpectraErrorCode.kAuthenticationFailed || message.toLowerCase().includes('auth')) {
            els.errorMessage.textContent = `${message || 'API key authentication failed.'} Please check SMARTSPECTRA_API_KEY in .env.`;
        } else {
            els.errorMessage.textContent = retryable ? `${message} (retryable)` : message;
        }

        if (!retryable || code === SmartSpectraErrorCode.kProcessingFailed || code === SmartSpectraErrorCode.kNetworkError) {
            stopSession();
        }
    });

    sdk.on('frameSentThrough', (sent, timestampUs) => {
        if (fpsMonitorCleanup && typeof fpsMonitorCleanup.recordSdkFrame === 'function') {
            fpsMonitorCleanup.recordSdkFrame(timestampUs);
        }
    });

    sdk.on('streamAvailable', (stream) => {
        activeStream = stream;
        els.preview.srcObject = stream;
        els.preview.play().catch(() => {});
    });

    return sdk;
}

// User Action Handlers -------------------------------------------------------

async function startMeasurement() {
    if (isOperationInProgress || currentState !== SessionState.IDLE) {
        console.warn(`[VYTA] Start ignored: operation in progress or state is ${currentState}`);
        return;
    }
    isOperationInProgress = true;
    const sessionEpoch = ++activeSessionEpoch;

    updateUIForState(SessionState.ACQUIRING_CAMERA);
    els.validation.innerHTML = 'Acquiring camera stream (640x480 @ 30 FPS)...';
    els.validation.className = 'hint hint-warn';
    els.errorBanner.hidden = true;
    lastErrorDetails = null;
    latestValidationCode = null;
    metricsCount = 0;
    timeOriginUs = null;
    validationHistory.length = 0;
    clearCharts();

    try {
        if (isMissingApiKey) {
            console.warn('[VYTA] SmartSpectra API key is missing or set to placeholder.');
        }

        // 1. Acquire camera stream with 640x480 / 30 FPS and exposure tuning
        const stream = await acquireCameraStream();
        if (sessionEpoch !== activeSessionEpoch) {
            for (const t of stream.getTracks()) t.stop();
            return;
        }
        activeStream = stream;

        // 2. Attach preview and transition to VERIFYING_CAMERA
        updateUIForState(SessionState.VERIFYING_CAMERA);
        els.validation.innerHTML = 'Verifying camera frame delivery rate (>= 25 FPS)...';
        els.validation.className = 'hint hint-warn';
        els.preview.srcObject = stream;
        await els.preview.play().catch(() => {});

        // Confirm video.readyState >= HAVE_CURRENT_DATA (2)
        if (els.preview.readyState < 2) {
            await new Promise((resolve) => {
                const onLoaded = () => {
                    els.preview.removeEventListener('loadeddata', onLoaded);
                    resolve();
                };
                els.preview.addEventListener('loadeddata', onLoaded);
                setTimeout(resolve, 1000);
            });
        }

        // 3. Pre-flight FPS verification: do not start processing until FPS is stable >= 25 for 2 seconds.
        console.log('[VYTA] Checking camera FPS stability (>= 25 FPS for 2 seconds)...');
        let stableConsecutiveSeconds = 0;
        const requiredStableSeconds = 2;
        const checkWindowMs = 1000;

        while (stableConsecutiveSeconds < requiredStableSeconds) {
            if (sessionEpoch !== activeSessionEpoch) {
                stopAllCameraResources();
                return;
            }

            const verification = await verifyCameraFps(stream, checkWindowMs);
            if (sessionEpoch !== activeSessionEpoch) {
                stopAllCameraResources();
                return;
            }

            const liveTrack = stream.getVideoTracks()[0];
            if (liveTrack) updateDebugPanel(liveTrack, verification.measuredFps);

            if (verification.measuredFps >= 25.0) {
                currentCameraStatus = 'READY';
                stableConsecutiveSeconds++;
                els.validation.innerHTML = `Camera frame rate stable at <strong>${verification.measuredFps.toFixed(1)} FPS</strong> (${stableConsecutiveSeconds}/${requiredStableSeconds}s)…`;
                els.validation.className = 'hint hint-warn';
            } else {
                currentCameraStatus = 'WARNING';
                stableConsecutiveSeconds = 0;
                els.validation.innerHTML = `Camera is running slow, increase light or pick another camera (delivering <strong>${verification.measuredFps.toFixed(1)} FPS</strong>, need ≥ 25 FPS)`;
                els.validation.className = 'hint hint-warn';
            }
        }

        // 4. Transition to STARTING_SDK and bind stream to authoritative SDK
        updateUIForState(SessionState.STARTING_SDK);
        els.validation.innerHTML = 'Starting SmartSpectra processing...';
        els.validation.className = 'hint hint-warn';

        // When Lock 30 FPS mode is enabled, the 39ms exposure can produce darker frames in dim rooms.
        // We use our GPU brightness filter pipeline to boost the stream forwarded to the SDK,
        // so MediaPipe face/chest tracking succeeds while maintaining the full 30 FPS frame rate!
        let sdkStream = stream;
        const lock30Fps = els.fpsLockToggle ? els.fpsLockToggle.checked : true;
        if (lock30Fps) {
            const gainPipeline = createSoftwareGainPipeline(stream, 2.5);
            if (gainPipeline) {
                activeBoostedStream = gainPipeline;
                sdkStream = gainPipeline.boostedStream;
                console.log('[VYTA] Software gain pipeline active (2.5x GPU brightness filter for Lock 30 FPS)');
            }
        }

        const instance = ensureAuthoritativeSdk();
        instance.useMediaStream(sdkStream);

        // 5. Start continuous FPS monitoring
        fpsMonitorCleanup = startContinuousFpsMonitor(
            els.preview,
            (report) => {
                const liveTrack = stream.getVideoTracks()[0];
                if (liveTrack) updateDebugPanel(liveTrack, report.rollingFps);
                if (report.totalFrames % 60 === 0) {
                    console.log(`[VYTA Continuous FPS] rolling=${report.rollingFps} overall=${report.overallFps} totalFrames=${report.totalFrames} readyState=${report.readyState}`);
                }
            },
            (warnReport) => {
                const explanation = explainFrameRateIssue(warnReport);
                els.errorBanner.hidden = false;
                els.errorCode.textContent = explanation.code;
                els.errorMessage.textContent = explanation.message;
            }
        );

        // 6. Start SDK processing
        await instance.start();
    } catch (err) {
        currentCameraStatus = 'FAILED';
        console.error('[VYTA] startMeasurement failed:', err);
        stopAllCameraResources();
        els.errorBanner.hidden = false;
        els.errorCode.textContent = err.code ?? 'JS';
        els.errorMessage.textContent = err.message || String(err);
        updateUIForState(SessionState.IDLE);
    } finally {
        isOperationInProgress = false;
    }
}

async function stopMeasurement() {
    if (isOperationInProgress) return;
    isOperationInProgress = true;
    try {
        await stopSession();
    } finally {
        isOperationInProgress = false;
    }
}

async function resetSession() {
    if (isOperationInProgress) return;
    isOperationInProgress = true;
    els.btnReset.disabled = true;
    els.btnStart.disabled = true;
    els.btnStop.disabled = true;
    try {
        if (currentState !== SessionState.IDLE) {
            await stopSession();
        }
        activeSessionEpoch++;
        if (sdk) {
            try {
                await sdk.reset();
            } catch (err) {
                console.warn('[VYTA] sdk.reset() warning:', err);
            }
        }
        els.errorBanner.hidden = true;
        lastErrorDetails = null;
        latestValidationCode = null;
        validationHistory.length = 0;
        clearCharts();
        els.validation.innerHTML = 'Click <strong>Start</strong> when ready.';
        els.validation.className = 'hint';
    } catch (err) {
        console.error('[VYTA] resetSession failed:', err);
    } finally {
        isOperationInProgress = false;
        updateUIForState(SessionState.IDLE);
    }
}

els.btnStart.addEventListener('click', startMeasurement);
els.btnStop.addEventListener('click',  stopMeasurement);
els.btnReset.addEventListener('click', resetSession);
els.cardioToggle.addEventListener('change', applyCardioVisibility);
if (els.screenLightToggle) {
    els.screenLightToggle.addEventListener('change', () => {
        document.body.classList.toggle('screen-light-on', els.screenLightToggle.checked);
    });
}

function switchTab(target) {
    const tabs = document.querySelectorAll('.nav-tab');
    const panes = document.querySelectorAll('.view-pane');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === target));
    panes.forEach(p => {
        const isActive = p.id === `view-${target}`;
        p.classList.toggle('active', isActive);
    });

    if (target === 'live-session') {
        resizeCharts();
    }
    if (target === 'history') {
        renderSessionHistory();
    }
}

function initTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    breathingCanvas = new AdaptiveBreathingCanvas(els);
    breathingCanvas.setTargetDurationMinutes(targetDurationMinutes);

    if (els.btnHeroStart) {
        els.btnHeroStart.addEventListener('click', () => {
            breathingCanvas.start();
        });
    }

    if (els.breathingOrb) {
        els.breathingOrb.addEventListener('click', () => {
            if (breathingCanvas.getState() === BreathingPhase.READY) {
                breathingCanvas.start();
            }
        });
    }

    if (els.btnHeroPause) {
        els.btnHeroPause.addEventListener('click', () => {
            breathingCanvas.pause();
        });
    }

    if (els.btnHeroResume) {
        els.btnHeroResume.addEventListener('click', () => {
            breathingCanvas.resume();
        });
    }

    if (els.btnHeroEnd) {
        els.btnHeroEnd.addEventListener('click', () => {
            breathingCanvas.endSession(false);
        });
    }

    const durPills = document.querySelectorAll('.dur-pill');
    durPills.forEach(pill => {
        pill.addEventListener('click', () => {
            if (breathingCanvas && breathingCanvas.isActive()) return;
            durPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            targetDurationMinutes = parseInt(pill.dataset.mins, 10);
            if (breathingCanvas) {
                breathingCanvas.setTargetDurationMinutes(targetDurationMinutes);
            }
        });
    });

    window.addEventListener('focus', () => {
        if (breathingCanvas && breathingCanvas.isActive()) {
            breathingCanvas.loop(performance.now());
        }
    });
}

function initSettings() {
    const REDUCED_MOTION_KEY = 'vyta_reduced_motion';
    const isReduced = localStorage.getItem(REDUCED_MOTION_KEY) === 'true';
    if (els.settingReducedMotion) {
        els.settingReducedMotion.checked = isReduced;
        document.body.classList.toggle('reduced-motion', isReduced);
        els.settingReducedMotion.addEventListener('change', () => {
            const enabled = els.settingReducedMotion.checked;
            document.body.classList.toggle('reduced-motion', enabled);
            try { localStorage.setItem(REDUCED_MOTION_KEY, String(enabled)); } catch { /* ignore */ }
        });
    }

    const GLOW_KEY = 'vyta_ambient_glow';
    const glowEnabled = localStorage.getItem(GLOW_KEY) !== 'false';
    if (els.settingAmbientGlow) {
        els.settingAmbientGlow.checked = glowEnabled;
        document.body.classList.toggle('no-glow', !glowEnabled);
        els.settingAmbientGlow.addEventListener('change', () => {
            const enabled = els.settingAmbientGlow.checked;
            document.body.classList.toggle('no-glow', !enabled);
            try { localStorage.setItem(GLOW_KEY, String(enabled)); } catch { /* ignore */ }
        });
    }

    if (els.btnClearHistory) {
        els.btnClearHistory.addEventListener('click', () => {
            if (confirm('Clear all recorded session history?')) {
                localStorage.removeItem(HISTORY_STORAGE_KEY);
                renderSessionHistory();
                updateLastSessionInsight();
            }
        });
    }

    if (els.btnExportData) {
        els.btnExportData.addEventListener('click', () => {
            const history = loadSessionHistory();
            const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vyta-session-history-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (els.btnPurgeData) {
        els.btnPurgeData.addEventListener('click', () => {
            if (confirm('Purge all VYTA local cache and settings?')) {
                localStorage.clear();
                alert('Local cache purged. Resetting defaults...');
                location.reload();
            }
        });
    }
}

// Phase 4: Onboarding, Consent & First-Run Experience -----------------------

const ONBOARDING_COMPLETED_KEY = 'vyta_onboarding_completed';
const ONBOARDING_CONSENT_KEY = 'vyta_onboarding_consent';
let currentOnboardingStep = 1;

function updateOnboardingUI() {
    const stepPanes = document.querySelectorAll('.onboarding-step-pane');
    const stepDots = document.querySelectorAll('.onboarding-stepper .step-dot');

    stepPanes.forEach(pane => {
        const step = parseInt(pane.dataset.step, 10);
        pane.classList.toggle('active', step === currentOnboardingStep);
    });

    stepDots.forEach(dot => {
        const step = parseInt(dot.dataset.step, 10);
        dot.classList.toggle('active', step === currentOnboardingStep);
        dot.classList.toggle('completed', step < currentOnboardingStep);
    });

    if (els.obStepIndicatorText) {
        els.obStepIndicatorText.textContent = `Step ${currentOnboardingStep} of 5`;
    }

    if (els.btnObBack) {
        els.btnObBack.hidden = (currentOnboardingStep === 1);
    }

    if (els.btnObNext) {
        if (currentOnboardingStep === 3) {
            els.btnObNext.disabled = !els.obConsentCheckbox?.checked;
            els.btnObNext.hidden = false;
            const span = els.btnObNext.querySelector('span');
            if (span) span.textContent = 'Continue →';
        } else if (currentOnboardingStep === 5) {
            els.btnObNext.hidden = true;
        } else {
            els.btnObNext.disabled = false;
            els.btnObNext.hidden = false;
            const span = els.btnObNext.querySelector('span');
            if (span) span.textContent = 'Continue →';
        }
    }
}

function showOnboarding(step = 1) {
    currentOnboardingStep = Math.max(1, Math.min(5, step));
    if (els.onboardingOverlay) {
        els.onboardingOverlay.hidden = false;
    }
    updateOnboardingUI();
}

function hideOnboarding() {
    if (els.onboardingOverlay) {
        els.onboardingOverlay.hidden = true;
    }
}

function completeOnboarding() {
    try {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch { /* ignore */ }
    hideOnboarding();
}

let isCheckingCamera = false;
async function performCameraCheck() {
    if (isCheckingCamera) return;
    isCheckingCamera = true;
    currentCameraStatus = 'CHECKING';
    if (els.btnObCheckCamera) els.btnObCheckCamera.disabled = true;

    if (els.obStatusBadge) {
        els.obStatusBadge.className = 'ob-status-badge status-checking';
        els.obStatusBadge.textContent = 'Checking camera…';
    }
    if (els.obDiagnosticLog) {
        els.obDiagnosticLog.innerHTML = 'Querying video input devices…';
    }
    if (els.obTroubleshootBox) {
        els.obTroubleshootBox.hidden = true;
    }

    let testStream = null;
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            throw new Error('MediaDevices API is not available in this environment.');
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const validCameras = videoInputs.filter(d => !isIrCamera(d.label));
        const candidates = validCameras.length > 0 ? validCameras : videoInputs;

        if (candidates.length === 0) {
            currentCameraStatus = 'FAILED';
            if (els.obStatusBadge) {
                els.obStatusBadge.className = 'ob-status-badge status-err';
                els.obStatusBadge.textContent = 'Camera unavailable';
            }
            if (els.obDiagnosticLog) {
                els.obDiagnosticLog.innerHTML = '<strong>No video input devices detected.</strong> Please ensure your camera is connected and recognized by Windows.';
            }
            if (els.obTroubleshootBox) els.obTroubleshootBox.hidden = false;
            return;
        }

        const selectedId = localStorage.getItem(CAMERA_STORAGE_KEY);
        const targetDevice = candidates.find(d => d.deviceId === selectedId) || candidates[0];

        // Safe stream probe: inspect settings and immediately release hardware
        testStream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: targetDevice?.deviceId ? { exact: targetDevice.deviceId } : undefined,
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        const track = testStream.getVideoTracks()[0];
        if (!track) {
            throw new Error('Acquired stream contains no video tracks.');
        }

        const settings = track.getSettings ? track.getSettings() : {};
        const width = settings.width || 640;
        const height = settings.height || 480;
        const fps = Math.round(settings.frameRate || 30);
        const label = track.label || targetDevice?.label || 'USB Camera';

        // Immediately stop all tracks to ensure camera light turns off and hardware is released
        testStream.getTracks().forEach(t => t.stop());
        testStream = null;

        currentCameraStatus = 'READY';
        if (els.obStatusBadge) {
            els.obStatusBadge.className = 'ob-status-badge status-ok';
            els.obStatusBadge.textContent = 'Camera ready';
        }
        if (els.obDiagnosticLog) {
            els.obDiagnosticLog.innerHTML = `<strong>Camera Ready:</strong> ${label} (${width}×${height} @ ~${fps} FPS). Safe stream probe completed and camera released.`;
        }
        if (els.obTroubleshootBox) {
            els.obTroubleshootBox.hidden = true;
        }
    } catch (err) {
        console.warn('[VYTA Onboarding] Camera check error:', err);
        if (testStream) {
            try { testStream.getTracks().forEach(t => t.stop()); } catch {}
            testStream = null;
        }

        const isPermission = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
        currentCameraStatus = isPermission ? 'WARNING' : 'FAILED';
        if (els.obStatusBadge) {
            els.obStatusBadge.className = `ob-status-badge ${isPermission ? 'status-warn' : 'status-err'}`;
            els.obStatusBadge.textContent = isPermission ? 'Permission required' : 'Camera initialization failed';
        }
        if (els.obDiagnosticLog) {
            if (isPermission) {
                els.obDiagnosticLog.innerHTML = `<strong>Permission Denied:</strong> Camera access was denied by Windows or privacy settings. Please grant camera permission.`;
            } else {
                els.obDiagnosticLog.innerHTML = `<strong>Initialization Failed:</strong> ${err.message || err.name || 'Could not acquire video stream'}.`;
            }
        }
        if (els.obTroubleshootBox) {
            els.obTroubleshootBox.hidden = false;
        }
    } finally {
        isCheckingCamera = false;
        if (els.btnObCheckCamera) els.btnObCheckCamera.disabled = false;
    }
}

function initOnboarding() {
    // Checkbox consent gating
    if (els.obConsentCheckbox) {
        const savedConsent = localStorage.getItem(ONBOARDING_CONSENT_KEY) === 'true';
        els.obConsentCheckbox.checked = savedConsent;

        els.obConsentCheckbox.addEventListener('change', () => {
            const checked = els.obConsentCheckbox.checked;
            if (checked) {
                try { localStorage.setItem(ONBOARDING_CONSENT_KEY, 'true'); } catch {}
            }
            if (currentOnboardingStep === 3 && els.btnObNext) {
                els.btnObNext.disabled = !checked;
            }
        });
    }

    // Step 1 Welcome actions
    if (els.btnObWelcomeNext) {
        els.btnObWelcomeNext.addEventListener('click', () => {
            currentOnboardingStep = 2;
            updateOnboardingUI();
        });
    }

    if (els.btnObWelcomeSkip) {
        els.btnObWelcomeSkip.addEventListener('click', () => {
            completeOnboarding();
            switchTab('overview');
        });
    }

    if (els.btnOnboardingSkip) {
        els.btnOnboardingSkip.addEventListener('click', () => {
            completeOnboarding();
            switchTab('overview');
        });
    }

    // Review Privacy settings button
    if (els.btnObReviewPrivacy) {
        els.btnObReviewPrivacy.addEventListener('click', () => {
            hideOnboarding();
            switchTab('settings');
        });
    }

    // Step navigation buttons
    if (els.btnObBack) {
        els.btnObBack.addEventListener('click', () => {
            if (currentOnboardingStep > 1) {
                currentOnboardingStep--;
                updateOnboardingUI();
            }
        });
    }

    if (els.btnObNext) {
        els.btnObNext.addEventListener('click', () => {
            if (currentOnboardingStep === 3 && !els.obConsentCheckbox?.checked) {
                return;
            }
            if (currentOnboardingStep < 5) {
                currentOnboardingStep++;
                updateOnboardingUI();
            }
        });
    }

    // Stepper dot clicks
    const stepDots = document.querySelectorAll('.onboarding-stepper .step-dot');
    stepDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const targetStep = parseInt(dot.dataset.step, 10);
            if (targetStep > 3 && !els.obConsentCheckbox?.checked) {
                currentOnboardingStep = 3;
            } else {
                currentOnboardingStep = targetStep;
            }
            updateOnboardingUI();
        });
    });

    // Step 5 Camera check button
    if (els.btnObCheckCamera) {
        els.btnObCheckCamera.addEventListener('click', performCameraCheck);
    }

    // Step 5 First session choices
    if (els.btnObStartBreathing) {
        const handleStartBreathing = () => {
            completeOnboarding();
            switchTab('overview');
            if (breathingCanvas) {
                breathingCanvas.start();
            }
        };
        els.btnObStartBreathing.addEventListener('click', handleStartBreathing);
        els.btnObStartBreathing.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStartBreathing();
            }
        });
    }

    if (els.btnObStartSensing) {
        const handleStartSensing = () => {
            completeOnboarding();
            switchTab('live-session');
        };
        els.btnObStartSensing.addEventListener('click', handleStartSensing);
        els.btnObStartSensing.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStartSensing();
            }
        });
    }

    // Settings replay button
    if (els.btnReopenOnboarding) {
        els.btnReopenOnboarding.addEventListener('click', () => {
            showOnboarding(1);
        });
    }

    // Keyboard accessibility: Escape to dismiss (if completed previously)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.onboardingOverlay && !els.onboardingOverlay.hidden) {
            const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
            if (completed) {
                hideOnboarding();
            }
        }
    });

    // Initial launch check
    const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
    if (!completed) {
        showOnboarding(1);
    } else {
        hideOnboarding();
    }
}

// Initial layout — the two cardio panels start dimmed until the user flips the Cardio toggle on.
applyCardioVisibility();
updateUIForState(SessionState.IDLE);

// Eagerly construct the single authoritative SDK session at startup
try {
    ensureAuthoritativeSdk();
} catch (sdkInitErr) {
    console.warn('[VYTA] SDK early init warning:', sdkInitErr?.message);
}

// Initialize VYTA Product UI Shell & State
initTabNavigation();
initSettings();
initSessionHistoryEvents();
renderSessionHistory();
updateLastSessionInsight();
initOnboarding();

// Authoritative graceful shutdown hook called by the main process before window destruction
window.__vytaGracefulShutdown = async () => {
    console.log('[VYTA] Graceful shutdown invoked from main process.');
    activeSessionEpoch++;
    isOperationInProgress = true;
    if (fpsMonitorCleanup) {
        try { fpsMonitorCleanup.stop(); } catch {}
        fpsMonitorCleanup = null;
    }
    try {
        if (sdk) {
            if (sdk.processingStatus !== ProcessingStatus.kIdle && sdk.processingStatus !== ProcessingStatus.kUninitialized) {
                await sdk.stop();
            }
            sdk.destroy();
            sdk = null;
        }
    } catch (err) {
        console.warn('[VYTA] Error stopping SDK during graceful shutdown:', err);
    } finally {
        stopAllCameraResources();
    }
    return true;
};

// Clean shutdown when the window closes or unmounts so native SDK threads join cleanly
// and camera tracks are immediately stopped.
window.addEventListener('beforeunload', () => {
    stopAllCameraResources();
    if (sdk) {
        try { sdk.destroy(); } catch { /* already destroyed */ }
        sdk = null;
    }
});
window.addEventListener('pagehide', () => {
    stopAllCameraResources();
});
window.addEventListener('unload', () => {
    stopAllCameraResources();
});

function getFaceDetectionStatus() {
    if (currentState !== SessionState.RUNNING) return 'Inactive';
    if (latestValidationCode === null || latestValidationCode === undefined) return 'Detecting';
    if (latestValidationCode === ValidationCode.kOk) return 'Face Detected';
    if (latestValidationCode === ValidationCode.kNoFaceFound) return 'No Face Found';
    if (latestValidationCode === ValidationCode.kTooDark || latestValidationCode === ValidationCode.kFaceObscured) {
        return 'Face Obscured / Dark';
    }
    if (latestValidationCode === ValidationCode.kCameraTuning) return 'Detecting';
    return 'Detecting';
}

function getSdkStatus() {
    if (!sdk) return 'Idle';
    switch (sdk.processingStatus) {
        case ProcessingStatus.kUninitialized:
        case ProcessingStatus.kIdle:
            return 'Idle';
        case ProcessingStatus.kStarting:
            return 'Starting';
        case ProcessingStatus.kRunning:
            return 'Running';
        case ProcessingStatus.kStopping:
            return 'Stopping';
        case ProcessingStatus.kError:
            return 'Error';
        default:
            return 'Idle';
    }
}

function getSignalStatus() {
    if (currentState !== SessionState.RUNNING) return 'Unavailable';
    if (latestValidationCode === ValidationCode.kOk) {
        if (accumulated.breathingRate.length > 0 || accumulated.pulseRate.length > 0) {
            return 'Signal Optimal';
        }
        return 'Evaluating';
    }
    return 'Unavailable';
}

// Diagnostic API exposed for test automation and verification
window.__vytaDiagnostics = {
    getCameraStatus: () => currentCameraStatus,
    getFaceDetectionStatus: () => getFaceDetectionStatus(),
    getSdkStatus: () => getSdkStatus(),
    getSignalStatus: () => getSignalStatus(),
    getDiagnosticSeparation: () => ({
        cameraAvailability: currentCameraStatus,
        faceDetection: getFaceDetectionStatus(),
        sdkProcessing: getSdkStatus(),
        signalValidity: getSignalStatus(),
        latestValidationCode,
        validationName: latestValidationCode !== null ? (VALIDATION_NAMES[latestValidationCode] || `Code(${latestValidationCode})`) : null,
        facialLuminance: fpsMonitorCleanup?.getFacialLuminance?.() ?? null,
        facialMetrics: fpsMonitorCleanup?.getFacialMetrics?.() ?? null,
    }),
    getState: () => currentState,
    getSettings: () => activeStream?.getVideoTracks()?.[0]?.getSettings?.() || null,
    getCapabilities: () => activeStream?.getVideoTracks()?.[0]?.getCapabilities?.() || null,
    getMetricsCount: () => metricsCount,
    getAccumulated: () => ({
        breathingRateCount: accumulated.breathingRate.length,
        breathingTraceCount: accumulated.breathingTrace.length,
        pulseRateCount: accumulated.pulseRate.length,
        latestBreathingRate: accumulated.breathingRate.length > 0 ? accumulated.breathingRate[accumulated.breathingRate.length - 1] : null,
        latestBreathingTrace: accumulated.breathingTrace.length > 0 ? accumulated.breathingTrace[accumulated.breathingTrace.length - 1] : null,
        latestPulseRate: accumulated.pulseRate.length > 0 ? accumulated.pulseRate[accumulated.pulseRate.length - 1] : null,
        allBreathingRateSamples: accumulated.breathingRate.map(s => ({
            timestamp: tsToNumber(s.timestamp),
            value: s.value,
            confidence: s.confidence,
            stable: s.stable,
        })),
    }),
    getValidationHistory: () => [...validationHistory],
    getFacialLuminance: () => fpsMonitorCleanup?.getFacialLuminance?.() ?? null,
    getFacialMetrics: () => fpsMonitorCleanup?.getFacialMetrics?.() ?? null,
    getLowResGrid: () => fpsMonitorCleanup?.getLowResGrid?.() ?? null,
    getOnboardingStep: () => currentOnboardingStep,
    isOnboardingVisible: () => els.onboardingOverlay ? !els.onboardingOverlay.hidden : false,
    setOnboardingStep: (s) => { currentOnboardingStep = s; updateOnboardingUI(); },
    checkCameraReadiness: () => performCameraCheck(),
    getConsentState: () => els.obConsentCheckbox ? els.obConsentCheckbox.checked : false,
    setConsentState: (v) => {
        if (els.obConsentCheckbox) {
            els.obConsentCheckbox.checked = v;
            updateOnboardingUI();
        }
    },
    completeOnboarding: () => completeOnboarding(),
    resetOnboarding: () => {
        try { localStorage.removeItem(ONBOARDING_COMPLETED_KEY); } catch {}
        showOnboarding(1);
    },
    getAnalytics: () => {
        const raw = loadSessionHistory();
        const norm = raw.map(normalizeSession).filter(Boolean);
        return calculateAnalytics(norm);
    },
    getNormalizedSessions: () => {
        const raw = loadSessionHistory();
        return raw.map(normalizeSession).filter(Boolean);
    },
    setSelectedDateFilter: (d) => {
        selectedDateFilter = d;
        renderSessionHistory();
    },
    getSelectedDateFilter: () => selectedDateFilter,
    openSessionDetailModal: (id) => openSessionDetailModal(id),
    closeSessionDetailModal: () => closeSessionDetailModal(),
    deleteSessionById: (id) => deleteSessionById(id),
    exportSessionHistoryJson: () => exportSessionHistoryJson(),
    recordSessionHistory: (dur, br, type, ext) => recordSessionHistory(dur, br, type, ext),
    setCalendarViewingDate: (d) => {
        calendarViewingDate = new Date(d);
        renderSessionHistory();
    },
    getCalendarViewingDate: () => calendarViewingDate,
    simulateRecoverableError: (code = 5, message = 'Metrics authorization failed: OPERATION_TIMEDOUT', retryable = true) => {
        if (sdk && typeof sdk._emit === 'function') {
            sdk._emit('error', code, message, retryable);
            sdk._emit('status', ProcessingStatus.kError);
        }
    },
};
