# Anonymous Review Writing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add policy-compliant anonymous review creation, editing, deletion, reporting, author blocking, and moderation to both mobile clients and the existing Bookchelin backend/admin/web.

**Architecture:** Firebase Anonymous Authentication UID is the ownership boundary. Mobile clients read published reviews from Firestore but perform every review/report mutation through v1 callable Cloud Functions. Review documents denormalize `user_uid` and `user_name`; the Vue admin uses authenticated callable moderation APIs, and the public Next.js site hosts the versioned community guidelines.

**Tech Stack:** Firebase Cloud Functions v1/Node 20, Firestore Rules, Node test runner, Vue 2/Firebase Web SDK 5, Next.js 16/Vitest, Android Java 8/Firebase Functions, Flutter 3/Dart/Firebase Functions/SharedPreferences.

## Global Constraints

- Keep the shared hidden convention exactly `hide: "1"`.
- Keep all new Cloud Functions on the v1 API and default region.
- Accept Firebase anonymous users for mobile review mutations; require an allowlisted email for admin operations.
- Store `user_uid` and `user_name` on each review; do not join a user profile collection.
- Permit one review per Firebase UID and book; only the owner UID may edit or delete it.
- Publish normal reviews immediately; store suspicious reviews as `pending` plus `hide: "1"`.
- Automatically hide a review after reports from three distinct UIDs.
- Preserve existing reviews that lack new schema fields.
- Do not expose book full text or add web review writing.

---

### Task 1: Review domain and callable backend

**Files:**
- Create: `functions/reviews.js`
- Create: `functions/test/reviews.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Produces: `submitReview`, `deleteReview`, `reportReview`, `adminListReviewReports`, `adminModerateReview` v1 callable exports.
- Produces: pure helpers `reviewDocumentId(bookId, uid)`, `reportDocumentId(reviewId, uid)`, `defaultNickname(uid)`, `validateReviewInput(data)`, and `classifyReview(data)` for tests.

- [ ] **Step 1: Write failing domain tests**

Cover deterministic IDs, `익명의 독자 XXXX`, rating 1–5, nickname/body lengths, URL/email/phone rejection or pending classification, and the three-distinct-report threshold with `node:test` assertions.

- [ ] **Step 2: Verify the tests fail**

Run: `cd functions && npm test -- test/reviews.test.js`

Expected: FAIL because `../reviews` does not exist.

- [ ] **Step 3: Implement the review service**

Implement pure validation separately from Firestore operations. Callable handlers must require `context.auth.uid`; derive document IDs server-side; ignore any client-supplied UID; use server timestamps; preserve `created_at` on edits; verify `user_uid` on edits/deletes; and transact report creation, `report_count`, and automatic `hide: "1"` at three unique reports.

Admin handlers must require `context.auth.token.email` in the shared allowlist and support `hide`, `restore`, `dismiss`, `ban`, and `unban`. Restore sets `moderation_status: "published"`, removes `hide`, and marks open reports reviewed so the same reports cannot immediately hide it again.

- [ ] **Step 4: Export v1 callable functions**

Wire each handler in `functions/index.js` using `functions.https.onCall(...)`; do not import `firebase-functions/v2`.

- [ ] **Step 5: Run backend tests and lint**

Run: `cd functions && npm test && npm run lint`

Expected: all tests pass and ESLint exits 0.

- [ ] **Step 6: Commit**

```bash
git add functions/reviews.js functions/test/reviews.test.js functions/index.js
git commit -m "feat(review): add anonymous review moderation APIs"
```

### Task 2: Firestore review security boundary

**Files:**
- Modify: `firestore.rules`
- Create: `functions/test/firestore-rules-review.test.js`
- Modify: `functions/package.json`
- Modify: `functions/package-lock.json`

**Interfaces:**
- Consumes: Cloud Functions Admin SDK writes from Task 1.
- Produces: public read/direct-write-denied rules for `book_reviews`; fully denied client access for `review_reports` and `review_user_bans`.

- [ ] **Step 1: Add failing Rules tests**

Use `@firebase/rules-unit-testing` and the Firestore emulator to assert that unauthenticated and anonymous clients can read `book_reviews`, cannot write it, and cannot read or write reports/bans.

- [ ] **Step 2: Verify existing rules fail the denial tests**

Run: `cd functions && npm test -- test/firestore-rules-review.test.js` with `firebase emulators:exec --only firestore` when the emulator is required.

Expected: FAIL because the current recursive wildcard allows all writes.

- [ ] **Step 3: Restrict only review-related collections**

Replace the unconditional recursive match with explicit review matches followed by a top-level collection wildcard whose allow condition excludes `book_reviews`, `review_reports`, and `review_user_bans`. Keep all unrelated legacy collections at their current permissive behavior.

- [ ] **Step 4: Run Rules tests**

Run: `nvm use stable && firebase emulators:exec --only firestore "cd functions && npm test -- test/firestore-rules-review.test.js"`

Expected: all Rules assertions pass.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/package.json functions/package-lock.json functions/test/firestore-rules-review.test.js
git commit -m "security(review): route review writes through functions"
```

### Task 3: Community guidelines web page

**Files:**
- Create: `nextjs-web/src/lib/community-guidelines.ts`
- Create: `nextjs-web/src/lib/community-guidelines.test.ts`
- Create: `nextjs-web/src/app/community-guidelines/page.tsx`
- Modify: `nextjs-web/src/components/site-footer.tsx`

**Interfaces:**
- Produces: public URL `https://bookchelin.com/community-guidelines` and exported `COMMUNITY_POLICY_VERSION = "2026-06-19"`.

- [ ] **Step 1: Write failing policy-content test**

Assert the version, contact email, prohibited-content categories, reporting, blocking, hiding, and enforcement language are present in the exported policy sections.

- [ ] **Step 2: Verify it fails**

Run: `cd nextjs-web && npm test -- src/lib/community-guidelines.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the page and footer link**

Build a server-rendered policy page using the existing `.policy` styles and canonical metadata. State that reviews are public, automated/manual filtering occurs, abuse can be hidden or sanctioned, and users can report/block in-app. Link it from the site footer.

- [ ] **Step 4: Verify web quality gates**

Run: `cd nextjs-web && npm test && npm run typecheck && npm run lint && npm run build`

Expected: all commands exit 0 and the route is included in the Next build.

- [ ] **Step 5: Commit**

```bash
git add nextjs-web/src/lib/community-guidelines.ts nextjs-web/src/lib/community-guidelines.test.ts nextjs-web/src/app/community-guidelines/page.tsx nextjs-web/src/components/site-footer.tsx
git commit -m "feat(web): publish review community guidelines"
```

### Task 4: Vue review moderation console

**Files:**
- Modify: `vue-project/src/main.js`
- Modify: `vue-project/src/admin_auth.js`
- Modify: `vue-project/src/views/EditReviewView.vue`

**Interfaces:**
- Consumes: `adminListReviewReports` and `adminModerateReview` callable functions from Task 1.
- Produces: authenticated report/pending review queue with hide, restore, dismiss, ban, and unban actions.

- [ ] **Step 1: Add Firebase Functions access and align allowlist**

Export `firebaseFunctions = firebase.functions()` from `main.js` and include `helgi2019@gmail.com` in the existing admin email allowlist while preserving existing administrators.

- [ ] **Step 2: Replace direct moderation writes**

Keep public review reads for the list but route hide/restore actions through `adminModerateReview`. Load open reports and pending reviews through `adminListReviewReports`; show report count, reasons, status, shortened author UID, and moderation action buttons.

- [ ] **Step 3: Build the legacy admin**

Run: `cd vue-project && npm install --ignore-scripts && npm run build`

Expected: Vue production build succeeds without new compile errors.

- [ ] **Step 4: Commit**

```bash
git add vue-project/src/main.js vue-project/src/admin_auth.js vue-project/src/views/EditReviewView.vue
git commit -m "feat(admin): add review report moderation queue"
```

### Task 5: Android review UX

**Files:**
- Modify: `app/build.gradle`
- Modify: `app/src/main/java/com/bookchelin/bookchelin/model/Review.java`
- Create: `app/src/main/java/com/bookchelin/bookchelin/util/ReviewPreferences.java`
- Modify: `app/src/main/java/com/bookchelin/bookchelin/util/BookReviewWriteDialog.java`
- Modify: `app/src/main/java/com/bookchelin/bookchelin/adapter/ReviewRecyclerAdapter.java`
- Modify: `app/src/main/java/com/bookchelin/bookchelin/BookDetailActivity.java`
- Modify: `app/src/main/res/layout/activity_book_detail.xml`
- Modify: `app/src/main/res/layout/dialog_book_review.xml`
- Modify: `app/src/main/res/layout/review_item.xml`
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `submitReview`, `deleteReview`, and `reportReview` callable functions.
- Produces: same-device ownership controls keyed by Firebase anonymous UID, local last nickname, policy version acceptance, and blocked-author UID set.

- [ ] **Step 1: Add Firebase Functions dependency and local preference helper**

Add `com.google.firebase:firebase-functions` matching the existing Firebase generation. `ReviewPreferences` stores `last_review_nickname`, accepted policy version `2026-06-19`, and a string set of blocked author UIDs.

- [ ] **Step 2: Correct and extend the Review model**

Ensure the document ID comes from `document.getId()` rather than the current UID, expose `userUid`, and tolerate missing legacy fields.

- [ ] **Step 3: Restore review writing through callable API**

Enable the review header button. Rework `BookReviewWriteDialog` to prefill the automatic/local nickname, collect policy consent with a link to the web policy, and call `submitReview`; never write Firestore directly.

- [ ] **Step 4: Add owner/report/block actions**

Own cards show edit/delete. Other cards show report reason selection and block author. Reporting calls `reportReview`; blocking updates preferences and immediately filters all matching reviews.

- [ ] **Step 5: Compile and manually smoke-check**

Run: `./gradlew assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add app/build.gradle app/src/main
git commit -m "feat(review): enable anonymous review writing on Android"
```

### Task 6: Flutter/iOS review UX

**Files:**
- Modify: `pubspec.yaml`
- Modify: `pubspec.lock`
- Create: `lib/src/services/review_service.dart`
- Modify: `lib/src/services/_services.dart`
- Create: `lib/src/widgets/review_write_dialog.dart`
- Modify: `lib/src/widgets/_widgets.dart`
- Modify: `lib/src/providers/app_preference.dart`
- Modify: `lib/src/pages/book_detail_page.dart`
- Create: `test/review_service_test.dart`

**Interfaces:**
- Consumes: the same callable function names and payloads as Android.
- Produces: platform-equivalent write/edit/delete/report/block behavior and local policy/nickname/block preferences.

- [ ] **Step 1: Add failing pure helper tests**

Test automatic nickname formatting, review map parsing with missing legacy fields, ownership detection, and blocked-author filtering.

- [ ] **Step 2: Verify they fail**

Run: `fvm flutter test test/review_service_test.dart`

Expected: FAIL because `ReviewService` does not exist.

- [ ] **Step 3: Add Functions client and preferences**

Add `cloud_functions`, implement callable methods, and extend `AppPreference` with last nickname, policy version, and blocked UID string list.

- [ ] **Step 4: Implement review dialog and card actions**

Add `리뷰쓰기` beside the section title. The dialog supports create/edit, rating, editable nickname, policy consent/link, and server error display. Own cards offer edit/delete; other cards offer report/block. Refresh the list after successful mutations.

- [ ] **Step 5: Verify Flutter**

Run: `fvm flutter pub get && fvm flutter test && fvm flutter analyze`

Expected: tests pass; analyze introduces no new errors. Pre-existing warnings may remain.

- [ ] **Step 6: Commit**

```bash
git add pubspec.yaml pubspec.lock lib test/review_service_test.dart
git commit -m "feat(review): add anonymous review writing on iOS"
```

### Task 7: Cross-platform verification and release readiness

**Files:**
- Modify only files requiring fixes discovered by verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified, deployable backend/web/admin and compilable mobile clients.

- [ ] **Step 1: Run backend and web verification**

Run Node 20+ commands: Functions tests/lint, Firestore emulator Rules tests, Next tests/typecheck/lint/build, and Vue build.

- [ ] **Step 2: Run mobile verification**

Run Android `./gradlew assembleDebug`; run Flutter `fvm flutter test` and `fvm flutter analyze`. If the known `app_links` CocoaPods issue still prevents simulator build, report it separately rather than attributing it to reviews.

- [ ] **Step 3: Check schema and policy parity**

Confirm both apps send `book_id`, `user_name`, `review`, `rating`, `policy_version`; neither sends a trusted UID; both expose edit/delete only for matching UID and report/block only for other users.

- [ ] **Step 4: Review diffs and repository status**

Run `git diff --check` and `git status --short` in all three repositories. Preserve pre-existing untracked `AGENTS.md` and unrelated plan files.

- [ ] **Step 5: Commit verification fixes**

Commit only scoped fixes in the repository where they were needed with an appropriate `fix(review): ...` message.
