const config = {
  // Capacitor serves the built app from a local origin; relative URLs keep
  // asset paths valid in both the browser and the native WebView.
  base: "./",
  publicDir: "public",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  resolve: {
    preserveSymlinks: true,
  },
};

export default config;
