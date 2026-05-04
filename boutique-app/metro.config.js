const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// 1. Watch all files in the project root (including the /shared folder)
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to find node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Enable modern module resolution
config.resolver.unstable_enablePackageExports = true;

const configWithNativeWind = withNativeWind(config, { input: "./global.css" });

const livekitRnCjs = path.resolve(
  projectRoot,
  "node_modules/@livekit/react-native/lib/commonjs/index.js"
);
const livekitRnWebStub = path.resolve(__dirname, "stubs/livekit-react-native.web.js");
const livekitClientUmd = path.resolve(
  projectRoot,
  "node_modules/livekit-client/dist/livekit-client.umd.js"
);

// react-native-maps uses native-only codegen; never bundle the real package on web.
const originalResolveRequest = configWithNativeWind.resolver.resolveRequest;
configWithNativeWind.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "stubs/react-native-maps.web.js"),
    };
  }
  if (moduleName === "@livekit/react-native") {
    if (platform === "web") {
      return { type: "sourceFile", filePath: livekitRnWebStub };
    }
    return { type: "sourceFile", filePath: livekitRnCjs };
  }
  if (moduleName === "livekit-client" && platform !== "web") {
    return { type: "sourceFile", filePath: livekitClientUmd };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = configWithNativeWind;



