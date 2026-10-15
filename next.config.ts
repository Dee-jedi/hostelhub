import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old printed QR codes pointed at /register
  async redirects() {
    return [{ source: "/register", destination: "/book", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Pages load their data in the browser after login (Firebase), so the staff area can't
    // render before that check. Only validate segments that opt in with `export const instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
