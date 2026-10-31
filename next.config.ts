import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old printed QR codes pointed at /register
  async redirects() {
    return [{ source: "/register", destination: "/book", permanent: false }];
  },
  // Firebase's sign-in helper pages, served from our own domain, so Google sign-in also works in
  // browsers that block third-party storage (set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to the domain)
  async rewrites() {
    const firebase = `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
    return [{ source: "/__/auth/:path*", destination: `${firebase}/__/auth/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Pages load their data in the browser after login (Firebase), so the staff area can't
    // render before that check. Only validate segments that opt in with `export const instant`.
    instantInsights: { validationLevel: "manual-warning" },
    // Remind about Next.js security fixes during `next dev` / `next build` (the default policy)
    agentUpgrade: "security",
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
