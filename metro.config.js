const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = getDefaultConfig(__dirname);

// Exclude volatile Replit system directories that can disappear mid-watch
// and crash Metro's FallbackWatcher with ENOENT errors.
config.watchFolders = [__dirname];
config.resolver = {
  ...config.resolver,
  blockList: [
    /\/.local\/state\/.*/,
    /\/.local\/skills\/\.old-.*/,
    /\/.local\/skills\/\.tmp-.*/,
    /\/.local\/secondary_skills\/\.tmp-.*/,
    /\/\.git\/.*/,
  ],
};

// The Replit Expo workflow has its own browser origin, while the API runs in
// the separate Express workflow on port 5000. Keep this proxy in Metro only:
// production uses server/index.ts and native clients use their configured API
// domain directly.
const apiProxy = createProxyMiddleware({
  target: "http://127.0.0.1:5000",
  changeOrigin: false,
  pathFilter: "/api",
});

const expoEnhanceMiddleware = config.server.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, metroServer) => {
    const enhancedMetroMiddleware = expoEnhanceMiddleware
      ? expoEnhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;

    return (req, res, next) => {
      if (req.url === "/api" || req.url?.startsWith("/api/")) {
        // http-proxy-middleware forwards the incoming request headers
        // (including Authorization, guest-token, and content headers) and
        // relays the backend response status and headers unchanged.
        return apiProxy(req, res, next);
      }
      return enhancedMetroMiddleware(req, res, next);
    };
  },
};

module.exports = config;
