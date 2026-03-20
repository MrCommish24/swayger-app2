const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude volatile Replit system directories that can disappear mid-watch
// and crash Metro's FallbackWatcher with ENOENT errors.
config.watchFolders = [__dirname];
config.resolver = {
  ...config.resolver,
  blockList: [
    /\/.local\/state\/.*/,
    /\/.local\/skills\/.old-.*/,
    /\/\.git\/.*/,
  ],
};

module.exports = config;
