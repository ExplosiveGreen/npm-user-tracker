/** @type {import('react-native-worklets/plugin').PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  strictGlobal: true,
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", worklets: false, reanimated: false }],
      "nativewind/babel",
    ],
    plugins: [
      ["react-native-worklets/plugin", workletsPluginOptions],
      ["inline-import", { "extensions": [".sql"] }]
    ]
  };
};
