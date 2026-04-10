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

module.exports = withNativeWind(config, { input: "./global.css" });



