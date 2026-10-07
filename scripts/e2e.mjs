#!/usr/bin/env node
// Cross-platform runner for the E2E sanity suite. Works on Windows, macOS, and
// Linux: adb.exe / maestro.bat are resolved through the OS shell on Windows,
// plain binaries elsewhere. Runs against the RELEASE build
// (com.anonymous.npmusertracker, installed separately) — background tasks and
// notifications don't exist in Expo Go, so a dev bundle can't test them;
// the network toggles cannot live in Maestro flows (it has no shell) so they
// live here with the flows split around them.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const IS_WIN = process.platform === 'win32';
const FLOWS = '.maestro';
const ADB = process.env.ADB || (IS_WIN ? 'adb.exe' : 'adb');
const APP_PKG = process.env.APP_PKG || 'com.anonymous.npmusertracker';

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: IS_WIN });
  if (res.error) throw new Error(`Failed to run ${cmd}: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${cmd} exited with status ${res.status}`);
}

const adb = (...args) => run(ADB, args);

// Runs a command capturing output; never throws so cleanup can always proceed.
function tryRun(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN });
  return { ok: !res.error && res.status === 0, stdout: res.stdout ?? '' };
}

const maestro = (flow) => run('maestro', ['test', path.join(FLOWS, flow)]);

// Force the emulator into a known light/dark mode; the theme flows assert on
// the "Following system" label, which is only deterministic with a known OS.
function setNightMode(mode) {
  adb('shell', 'cmd', 'uimode', 'night', mode); // yes | no | auto
}

// Block the main thread briefly; a SharedArrayBuffer is only used to sleep.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function requireDevice() {
  const res = spawnSync(ADB, ['get-state'], { stdio: 'ignore', shell: IS_WIN });
  if (res.error || res.status !== 0) {
    console.error('ERROR: no Android device/emulator connected (adb devices).');
    process.exit(1);
  }
}

// The release build must be installed for the flows; it is built and uploaded
// by the throwaway-release process, or installable from the release page.
function requireApp() {
  const check = tryRun(ADB, ['shell', 'pm', 'path', APP_PKG]);
  if (check.ok && check.stdout.includes('package:')) return;
  console.error(`ERROR: release app ${APP_PKG} is not installed on the device.`);
  console.error('Install the throwaway release APK first, then rerun.');
  process.exit(1);
}

// Maestro's inputText uses setText, which bypasses React Native's onChange —
// the visible text arrives but component state never updates, so Add/Apply
// buttons silently no-op. Typing through adb key events goes through the IME,
// so onChange fires and state syncs. Call only right after a flow focused the
// field; the settle wait lets the IME/RN bridge catch up.
function typeText(text) {
  adb('shell', 'input', 'text', text.replace(/ /g, '%s'));
  sleep(2000);
  // Commit Gboard's composing buffer: injected keys sit uncommitted (visible
  // but RN onChange never fires) until Enter commits them with the final text.
  adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
  sleep(3000);
}

// Dumps the on-device UI hierarchy and returns it as text.
function uiDump() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/e2e.xml');
  const local = path.join(os.tmpdir(), 'e2e-ui.xml');
  adb('pull', '/sdcard/e2e.xml', local);
  return readFileSync(local, 'utf8');
}

// Center of the first hierarchy node mentioning key (testIDs land in the
// node's resource-id/content-desc), or null when absent.
function findCenter(xml, key) {
  for (const m of xml.matchAll(/<node[^>]*>/g)) {
    if (!m[0].includes(key)) continue;
    const b = m[0].match(/bounds="([^"]*)"/);
    if (!b) continue;
    const n = b[1].match(/\d+/g).map(Number);
    return [(n[0] + n[2]) >> 1, (n[1] + n[3]) >> 1];
  }
  return null;
}

function tapKey(key) {
  const c = findCenter(uiDump(), key);
  if (!c) throw new Error(`No UI node found for ${key}`);
  adb('shell', 'input', 'tap', String(c[0]), String(c[1]));
  sleep(1000);
}

// Types a username and taps Add until the queued row is actually on screen.
// Retries paper over focus races and IME lag: each attempt refocuses, clears
// via Delete key events (which keep React state in sync), retypes through
// key events, and taps Add at its current bounds (suggestion rows shift it).
function ensureQueued(name, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    tapKey('username-input');
    const before = uiDump();
    const cur = (before.match(/username-input"[^>]*text="([^"]*)"/) ?? before.match(/text="([^"]*)"[^>]*username-input/));
    const len = cur ? [...cur[1]].length : 0;
    for (let k = 0; k < len; k++) adb('shell', 'input', 'keyevent', 'KEYCODE_DEL');
    typeText(name);
    tapKey('add-user');
    sleep(3000);
    if (uiDump().includes(`Queued: scanning ${name}`)) {
      console.log(`Queued ${name} (attempt ${i}).`);
      return;
    }
    console.log(`Queue attempt ${i} for ${name} missed, retrying...`);
  }
  throw new Error(`Add user never queued for ${name}`);
}

// Scans run exclusively in the OS background task, so the flows can only
// queue work from the UI. This forces the scheduled WorkManager job to run
// right now via adb (Expo's documented recipe) instead of waiting for the OS
// window. Forcing is flaky (stale job entries, occupied worker slots), so it
// verifies the job actually left `queued` via UI dumps and retries the force.
function forceBackgroundScan() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    sleep(1000);
    const dump = tryRun(ADB, ['shell', 'dumpsys', 'jobscheduler']);
    // Narrow to this app's WorkManager jobs (component SystemJobService).
    const ours = new Set();
    for (const line of dump.stdout.split('\n')) {
      if (line.includes(APP_PKG) && line.includes('SystemJobService')) {
        const m = line.match(/\/(\d+):/);
        if (m) ours.add(m[1]);
      }
    }
    if (ours.size === 0) throw new Error('No scheduled background job found for the release app.');
    for (const jobId of ours) {
      console.log(`Forcing background job ${jobId} (attempt ${attempt})...`);
      adb('shell', 'cmd', 'jobscheduler', 'run', '-f', APP_PKG, jobId);
    }
    // The forced run needs the app backgrounded, but the UI must be visible
    // to observe it — bring it back and watch for the queued row to flip.
    adb('shell', 'am', 'start', '-n', `${APP_PKG}/.MainActivity`);
    if (waitForScanStart()) {
      // Let the run progress; the result flows gate on terminal states.
      sleep(60000);
      return;
    }
    console.log(`Force attempt ${attempt} started nothing, retrying...`);
  }
  throw new Error('Background scan never started after 3 force attempts.');
}

// True once no `Queued: scanning …` row remains (it flipped to running,
// failed, or done) — or false after the timeout.
function waitForScanStart(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!uiDump().includes('Queued: scanning')) return true;
    sleep(5000);
  }
  return false;
}
function cleanup() {
  console.log('== Cleanup ==');
  // The offline flow can crash mid-suite and leave the network off.
  tryRun(ADB, ['shell', 'svc', 'wifi', 'enable']);
  tryRun(ADB, ['shell', 'svc', 'data', 'enable']);
  // The theme flows force a specific night mode; hand control back to the OS.
  tryRun(ADB, ['shell', 'cmd', 'uimode', 'night', 'auto']);
  // Wipe any test data (users, jobs, scans) written during the suite.
  tryRun(ADB, ['shell', 'pm', 'clear', APP_PKG]);
}

requireDevice();
requireApp();

let failed = false;
try {
  console.log('== Wrong username ==');
  maestro('wrong-username.yaml');
  ensureQueued('~t3dotgg');
  forceBackgroundScan();
  maestro('wrong-username-result.yaml');

  console.log('== Offline: adding a user queues a job, background run fails it ==');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  maestro('offline-add.yaml');
  ensureQueued('instafluff');
  forceBackgroundScan();
  maestro('offline-add-result.yaml');

  console.log('== Online: retry + background run populates all tables ==');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  // The offline flow can crash mid-suite and leave the network off, and the
  // emulator needs longer than a blink to bring connectivity back.
  sleep(15000);
  maestro('online-retry-queue.yaml');
  forceBackgroundScan();
  maestro('online-retry-result.yaml');

  console.log('== Table screen: delete a row ==');
  maestro('table-delete.yaml');

  console.log('== Theme: pin dark over a light OS, then release ==');
  setNightMode('no');
  maestro('theme-toggle.yaml');

  console.log('== Theme: follow a dark OS, pin light over it, then release ==');
  setNightMode('yes');
  maestro('theme-follow-system.yaml');

  console.log('All E2E flows passed.');
} catch (err) {
  failed = true;
  console.error(`E2E suite failed: ${err.message}`);
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);