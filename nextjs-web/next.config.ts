import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public marketing/SEO site lives on bookchelin.com (this App Hosting
  // backend). The EPUB viewer is still served by the legacy Firebase Hosting
  // site (bookchelin.firebaseapp.com), which 301s /epub-viewer/{id} to the Vue
  // admin SPA at /admin/epub-viewer/{id}. The mobile clients now point at the
  // stable bookchelin.com vanity URL; this redirect resolves it to the viewer
  // so the apps don't need a re-release if the viewer host changes again.
  async redirects() {
    return [
      {
        source: "/epub-viewer/:path*",
        destination: "https://bookchelin.firebaseapp.com/epub-viewer/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
