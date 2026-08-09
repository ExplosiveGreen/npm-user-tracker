#!/usr/bin/env node
// Cross-platform runner for the E2E sanity suite. Works on Windows, macOS, and
// Linux: adb.exe / maestro.bat are resolved through the OS shell on Windows,
// plain binaries elsewhere. Requires Metro (port 8081), an Android emulator,
// and a device with Expo Go installed (installed automatically if missing);
// the network toggles cannot live in Maestro flows (it has no shell) so they
// live here with the flows split around them.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const IS_WIN = process.platform === 'win32';
const FLOWS = '.maestro';
const ADB = process.env.ADB || (IS_WIN ? 'adb.exe' : 'adb');
const EXPO_GO_PKG = 'host.exp.exponent';

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

// The flows open the app through exp://127.0.0.1:8081, so the emulator needs
// the host's Metro port forwarded.
function ensurePortForward() {
  const res = tryRun(ADB, ['reverse', 'tcp:8081', 'tcp:8081']);
  if (!res.ok) {
    console.error('ERROR: could not set up adb reverse tcp:8081.');
    process.exit(1);
  }
}

// Expo Go shows the app by loading the JS bundle from Metro; without a running
// dev server the app never gets to the home screen. Fail with guidance early
// instead of letting the flows time out.
async function requireMetro() {
  try {
    const res = await fetch('http://localhost:8081/status', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok && (await res.text()).includes('running')) return;
  } catch {
    // fall through to the error below
  }
  console.error('ERROR: Metro dev server is not reachable on port 8081.');
  console.error('Start it with `npx expo start --port 8081` and try again.');
  process.exit(1);
}

// Expo Go must be present for the flows; download and install it otherwise.
async function ensureExpoGo() {
  const check = tryRun(ADB, ['shell', 'pm', 'path', EXPO_GO_PKG]);
  if (check.ok && check.stdout.includes('package:')) return;
  console.log('Expo Go not found, downloading...');

  // Match Expo Go to the project's SDK (read from the installed expo package)
  // so it can actually load the app rather than downloading a legacy client.
  const expoPkg = JSON.parse(
    await readFile(path.join(process.cwd(), 'node_modules', 'expo', 'package.json'), 'utf8'),
  );
  const sdkMajor = Number(expoPkg.version.split('.')[0]);

  const versions = await fetch('https://api.expo.dev/v2/versions/latest').then((r) => {
    if (!r.ok) throw new Error(`Expo versions API returned ${r.status}`);
    return r.json();
  });
  const sdkEntry = Object.entries(versions?.data?.sdkVersions ?? {})
    .filter(([key]) => key.startsWith(`${sdkMajor}.`))
    .sort()
    .pop()?.[1];
  const apkUrl = sdkEntry?.androidClientUrl;
  if (!apkUrl) throw new Error(`No Expo Go APK URL for SDK ${sdkMajor} in Expo versions API.`);
  const apkPath = path.join(os.tmpdir(), 'expo-go.apk');
  const apk = await fetch(apkUrl).then((r) => {
    if (!r.ok) throw new Error(`Expo Go download returned ${r.status}`);
    return r.arrayBuffer();
  });
  await writeFile(apkPath, Buffer.from(apk));
  console.log('Installing Expo Go...');
  adb('install', '-r', apkPath);
  console.log('Expo Go installed.');
}

// Leave the device and app in a clean state even when a flow fails early.
function cleanup() {
  console.log('== Cleanup ==');
  // The offline flow can crash mid-suite and leave the network off.
  tryRun(ADB, ['shell', 'svc', 'wifi', 'enable']);
  tryRun(ADB, ['shell', 'svc', 'data', 'enable']);
  // Wipe any test data (users, jobs, scans) written during the suite.
  tryRun(ADB, ['shell', 'pm', 'clear', EXPO_GO_PKG]);
}

requireDevice();
await requireMetro();
ensurePortForward();

let failed = false;
try {
  await ensureExpoGo();

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
} catch (err) {
  failed = true;
  console.error(`E2E suite failed: ${err.message}`);
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);