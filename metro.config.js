const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
let config = getDefaultConfig(__dirname);

config = getBundleModeMetroConfig(config);

// @durable/runtime is an unpublised `file:` dependency, so Metro must watch the
// symlink target's directory for the package's source files to resolve and
// hot-reload (see durable-client INTEGRATION.md §2.1, Option A). The runtime
// has no transitive dependencies, so no nodeModulesPaths entry is required.
try {
  const runtimeDir = fs.realpathSync(
    path.join(__dirname, 'node_modules', '@durable', 'runtime'),
  );
  config.watchFolders = [...(config.watchFolders ?? []), path.dirname(runtimeDir)];
} catch {
  // Dependency not installed — nothing to watch.
}

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
