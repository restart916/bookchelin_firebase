import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // epubjs's continuous-scroll manager can't survive StrictMode's dev-only
  // double-mount (the first rendition is destroyed mid-init, hanging the
  // second's display() so the viewer renders nothing). StrictMode is inert in
  // production, so disabling it only affects dev — and makes dev match prod.
  reactStrictMode: false,
};

export default nextConfig;
