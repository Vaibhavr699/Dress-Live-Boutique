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

// @livekit/react-native "exports" points at "./lib/commonjs/index" without .js — use concrete
// native file on iOS/Android; use a web stub on web (real package is not browser-safe).
const livekitRnCjs = path.resolve(
  projectRoot,
  "node_modules/@livekit/react-native/lib/commonjs/index.js"
);
const livekitRnWebStub = path.resolve(__dirname, "stubs/livekit-react-native.web.js");
const livekitClientUmd = path.resolve(
  projectRoot,
  "node_modules/livekit-client/dist/livekit-client.umd.js"
);
const originalResolveRequest = configWithNativeWind.resolver.resolveRequest;
configWithNativeWind.resolver.resolveRequest = (context, moduleName, platform) => {
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



