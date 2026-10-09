import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the site under /<repo-name>/ ; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0") },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Container Sales",
        short_name: "Sales",
        description: "Family stock & sales tracker",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f7f5f0",
        theme_color: "#0f766e",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // the app shell is cached; data always comes live from Supabase
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/storage/v1/object/public/item-photos/"),
            handler: "CacheFirst",
            options: {
              cacheName: "item-photos",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1500 },
});
