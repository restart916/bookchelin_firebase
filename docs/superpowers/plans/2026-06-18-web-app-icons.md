# Web App Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public Next.js website icons with deterministic derivatives of the official 1024×1024 Bookchelin app icon.

**Architecture:** Copy no mobile code into the web project. Read the iOS App Store artwork as the source image, generate committed web-sized assets, and expose a typed Next.js Web App Manifest. Next.js metadata file conventions supply favicon and Apple touch icon links automatically.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, macOS `sips`, Node.js 22

## Global Constraints

- Modify only `/Users/yongsanglee/Code/bookchelin_firebase`.
- Treat `/Users/yongsanglee/Code/bookchelin_flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset/ItunesArtwork@2x.png` as read-only source material.
- Preserve the square image without cropping, rounded corners, padding, or color changes.
- Do not modify mobile application files.

---

### Task 1: Web App Manifest

**Files:**
- Create: `nextjs-web/src/app/manifest.test.ts`
- Create: `nextjs-web/src/app/manifest.ts`

**Interfaces:**
- Produces: Next.js `MetadataRoute.Manifest` at `/manifest.webmanifest`.
- Consumes: committed `/icons/icon-192.png` and `/icons/icon-512.png` paths from Task 2.

- [x] **Step 1: Write the failing test**

Create a Vitest test that imports the manifest and expects `name: "북슐랭"`, `display: "standalone"`, theme/background color `#f44336` sampled from the source artwork, and 192×192 plus 512×512 icon declarations.

- [x] **Step 2: Verify the test fails**

Run: `nvm use stable && cd nextjs-web && npm test -- --run src/app/manifest.test.ts`

Expected: FAIL because `manifest.ts` does not exist.

- [x] **Step 3: Implement the manifest**

Export a default `manifest(): MetadataRoute.Manifest` function containing the tested values, `start_url: "/"`, and PNG icon MIME types.

- [x] **Step 4: Verify the test passes**

Run the same targeted test and expect one passing test file.

### Task 2: Deterministic Icon Assets

**Files:**
- Replace: `nextjs-web/src/app/favicon.ico`
- Create: `nextjs-web/src/app/icon.png`
- Create: `nextjs-web/src/app/apple-icon.png`
- Create: `nextjs-web/public/icons/icon-192.png`
- Create: `nextjs-web/public/icons/icon-512.png`

**Interfaces:**
- Consumes: the read-only 1024×1024 official application icon.
- Produces: browser, Apple touch, and installable web app images.

- [x] **Step 1: Generate PNG derivatives**

Use `sips --resampleHeightWidth` to create 512×512, 180×180, and 192×192 square PNG files from the source image. Generate `favicon.ico` from a 48×48 derivative using the writable ICO format supported by `sips`.

- [x] **Step 2: Verify image dimensions and formats**

Run `file` and `sips -g pixelWidth -g pixelHeight` for every generated asset. Expect ICO for favicon and exact PNG dimensions of 512, 180, 192, and 512 pixels.

- [x] **Step 3: Verify mobile repositories are unchanged**

Run `git -C ../bookchelin_android status --short` and `git -C ../bookchelin_flutter status --short`, comparing against their pre-task state. No new mobile changes may appear.

### Task 3: Full Verification and Delivery

**Files:**
- Verify all files from Tasks 1 and 2.

**Interfaces:**
- Consumes: completed manifest and generated assets.
- Produces: a deployable Next.js build.

- [x] **Step 1: Run full web verification**

Run: `nvm use stable && cd nextjs-web && npm test && npm run lint && npm run typecheck && npm run build`

Expected: all tests pass and the production build lists `/manifest.webmanifest` plus icon metadata routes.

- [x] **Step 2: Inspect the production metadata**

Start the production server locally and verify `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/icons/icon-192.png`, `/icons/icon-512.png`, and `/manifest.webmanifest` return HTTP 200 with correct content types.

- [ ] **Step 3: Commit, push, and deploy**

Commit only the web icon implementation and this plan. Push `master`, create an App Hosting rollout for that commit, and verify the same URLs on `https://bookchelin.com`.
