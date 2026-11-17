const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const sharedRoot = path.resolve(monorepoRoot, 'packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot, path.resolve(monorepoRoot, 'node_modules')].filter((p) => fs.existsSync(p));
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
].filter((p) => fs.existsSync(p));
config.resolver.extraNodeModules = {
  '@terreno/shared': sharedRoot,
};

module.exports = config;
