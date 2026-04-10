module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          unstable_transformImportMeta: true,
        },
      ],
      "nativewind/babel",
    ],
    plugins: [
      "@babel/plugin-syntax-import-meta",
      "babel-plugin-transform-import-meta",
      "react-native-reanimated/plugin",
    ],
    sourceType: "unambiguous",
    overrides: [
      {
        test: /[\\/]node_modules[\\/]/,
        plugins: ["babel-plugin-transform-import-meta"],
      },
    ],
  };
};



