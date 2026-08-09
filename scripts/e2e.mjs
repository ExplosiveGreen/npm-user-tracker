#!/usr/bin/env node
// Cross-platform runner for the E2E sanity suite. Works on Windows, macOS, and
// Linux: adb.exe / maestro.bat are resolved through the OS shell on Windows,
// plain binaries elsewhere. Requires Metro (port 8081) and an Android emulator
// with Expo Go; the network toggles cannot live in Maestro flows (it has no
// shell) so they live here with the flows split around them.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const IS_WIN = process.platform === 'win32';
const FLOWS = '.maestro';
const ADB = process.env.ADB || (IS_WIN ? 'adb.exe' : 'adb');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: IS_WIN });
  if (res.error) throw new Error(`Failed to run ${cmd}: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${cmd} exited with status ${res.status}`);
}

const adb = (...args) => run(ADB, args);
const maestro = (flow) => run('maestro', ['test', path.join(FLOWS, flow)]);

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

// Leave the device and app in a clean state even when a flow fails early.
function cleanup() {
  console.log('== Cleanup ==');
  // The offline flow can crash mid-suite and leave the network off.
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  // Wipe any test data (users, jobs, scans) written during the suite.
  adb('shell', 'pm', 'clear', 'host.exp.exponent');
}

requireDevice();

let failed = false;
try {
  console.log('== Wrong username ==');
  maestro('wrong-username.yaml');

  console.log('== Offline: adding a user must fail with a retry button ==');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  maestro('offline-add.yaml');

  console.log('== Online: retry populates all tables ==');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  // Give Android a moment to bring connectivity back before retrying the job.
  sleep(3000);
  maestro('online-retry.yaml');

  console.log('All E2E flows passed.');
} catch {
  failed = true;
  console.error('E2E suite failed.');
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);