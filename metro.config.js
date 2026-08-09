const { getDefaultConfig } = require('expo/metro-config');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
let config = getDefaultConfig(__dirname);

config = getBundleModeMetroConfig(config);

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
