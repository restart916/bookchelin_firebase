# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend for **Bookchelin (북슐랭)** — Firebase project `bookchelin`. Contains Cloud Functions, Firestore rules + indexes, the Vue 2 admin web app, and one-shot operational scripts. Single Firebase project, shared by all clients.

**Sibling repos (clients that consume this backend):**
- `../bookchelin_android` — Android client (Java 8). Has its own `CLAUDE.md`.
- `../bookchelin_flutter` — iOS client (Flutter / Dart 3). Has its own `CLAUDE.md`.

This repo is the **source of truth for the Firestore data model**. Any schema change here must be mirrored in both clients (or flagged for them to follow up).

## Common commands

```bash
# Functions: install deps
cd functions && npm install

# Functions: lint (run by predeploy)
cd functions && npm run lint

# Deploy a specific Cloud Function
firebase deploy --only functions:update_search_index_on_book_write

# Deploy all functions
firebase deploy --only functions

# Deploy Firestore indexes + rules
firebase deploy --only firestore:indexes,firestore:rules

# Deploy Storage rules
firebase deploy --only storage

# Vue admin: install (uses --ignore-scripts; legacy grpc cannot compile on Node 20+ ARM64)
cd vue-project && npm install --ignore-scripts

# Vue admin: build + deploy hosting (admin UI → public/admin, served at /admin/)
cd vue-project && npm run build && cd .. && firebase deploy --only hosting

# Tail recent function logs
firebase functions:log -n 100
```

**CLI version requirement:** `firebase-tools` ≥ 13 requires Node ≥ 20. The repo's `functions/package.json` sets `engines.node: "20"`; deploys fail from Node ≤ 18. Use `nvm use stable` before running `firebase` commands.

**Service account key for `scripts/`:** scripts read either `scripts/serviceAccountKey.json` or `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` env var. Real key files match `*-adminsdk-*.json` (already gitignored) — never commit.

## Architecture — the parts that span multiple files

### Cloud Functions (`functions/index.js`)

Monolithic file. Mixes:
- HTTPS endpoints (`date`, `addMessage`, `test`, `get_limit_events`, `get_limit_events_asia`)
- Firestore triggers (`addTimeStamp`, `add_time_read_time_logs`, `update_search_index_on_book_write`)
- PubSub schedule consumers (`daily_job`, `hourly_job`, `minutes_job`) — actual schedule is configured via Cloud Scheduler publishing to those topic names

All triggers use the **v1 API** (`functions.firestore.document(...).onWrite(...)`, `functions.https.onRequest(...)`, `functions.pubsub.topic(...).onPublish(...)`). Do not migrate individual exports to v2 (`firebase-functions/v2/...`) piecemeal — mixing breaks shared `admin` initialization patterns. Migration to v2 is a separate, deliberate project.

The `_firebaseMessagingBackgroundHandler` analog and other top-level entry points must stay top-level and the relevant trigger handlers in `index.js` cannot reference closures over `request`-scoped state.

### `search_index/books` denormalized document

Single Firestore document holding lean catalog metadata for client-side full-text search:

```json
{
  "updated_at": <Timestamp>,
  "books": [{"id": "...", "title": "...", "description": "..."}, ...]
}
```

Maintained by trigger `update_search_index_on_book_write` (`books/{bookId}` onWrite, transactional). The trigger filters `hidden !== true` and uses `typeof === 'string'` guards before writing string fields. Clients (`bookchelin_android` `SearchIndexEntry` model + `BookListManager.loadSearchIndex`, `bookchelin_flutter` same) consume this doc directly.

Backfill from existing data: `scripts/backfill_search_index.js`. Idempotent. Run once after schema change.

**If you change the shape of `books[].*` entries**, you must update both clients in lockstep.

### `limit_event` / `time_event` subcollection layout

After the May 2026 migration (`scripts/migrate_event_history_phase_a.js` then `phase_b.js`), all event docs have:

```
limit_event/{eventId}                  # also time_event/{eventId}
  read_history: []                      # left empty, kept as safety field
  has_subcollection_history: true       # marker — all helpers require this
  user_count, total_read_time           # parent-cached aggregates
  remain_time (time_event only)         # = max(0, event_minute - total_read_time)
  read_history/{user_uid}  (subcollection)
    limit_event: {total_time, logs: [{read_time, datetime}]}
    time_event:  {read_time, datetime: [timestamp, ...]}
```

`updateLimitEvent` / `updateTimeEvent` / `get_limit_events_*` in `index.js` are the **only writers** to this structure and all assume `has_subcollection_history === true`. They emit a `console.warn` and skip if not. Do not introduce a code path that creates a new event doc without this marker.

`loadEventUnitData` (used by `daily_job` → `dayly_event_count`) reads `user_count`/`total_read_time` from the parent doc; it must not iterate `read_history`.

### `firebase.json` layout

Tracks four targets:
- `functions` (predeploy lint)
- `firestore` (rules + indexes, both locally managed since 2026-05-15)
- `storage` (rules)
- `hosting` (`public/` — since 2026-06: Vue admin lives under `/admin/` (`public/admin/`, noindex), everything else rewrites to the `web_book` function which SSRs the public SEO pages: `/` landing, `/book/{id}`, `/sitemap.xml`. Old admin root URLs 301-redirect to `/admin/...`. **Never expose book full text on the web pages** — they exist to funnel app installs)

`firestore.rules` / `storage.rules` were exported from production into the repo. The convention now is **never edit rules in the Firebase Console** — all changes go through git → `firebase deploy --only firestore:rules`. The current production rules are highly permissive (everything readable/writable) and known-flagged as a security debt.

### Composite Firestore indexes (`firestore.indexes.json`)

One index currently tracked: `books` collection with `hidden ASC + category ASC + order DESC` (required by the category-scoped paginated query in both mobile clients). Other indexes exist in production but are not yet in this file — running `firebase deploy --only firestore:indexes` will offer to delete them; **always answer "No"** until they are explicitly imported here.

### `scripts/` (one-shot ops)

- `backfill_search_index.js` — rebuild `search_index/books`
- `migrate_event_history_phase_a.js` / `phase_b.js` — migrate event docs to subcollection layout (already run — keep for disaster recovery)
- `fetch_current_rules.js` — pull production rules/index files locally
- `check_active_events.js` — diagnostic listing of active time/limit events
- `build_gongu_epubs.py` + `upload_gongu_books.js` — public-domain (만료저작물) book pipeline: Wikisource → cover PNG + EPUB → Storage + `books` doc. **Adding new free books? Read `docs/public-domain-books.md` first** (legal criteria, field types, full workflow)
- `verify-book-images.mjs`, `build-link-select-bestseller-candidates.mjs`, `import-link-select-batch.mjs` — older Vue/REST-based ops (do not import firebase-admin)

Mixed style: `.js` (CommonJS, uses `firebase-admin`) and `.mjs` (ESM, uses Firestore REST API directly). Both patterns are acceptable; match neighbors when adding new scripts.

### Vue admin (`vue-project/`)

**Legacy / EOL stack** — Vue 2.6, vue-cli 3, Firebase web SDK 5, node-sass. `npm install` requires `--ignore-scripts` because the transitive `grpc@1.20.0` cannot compile on modern Node/ARM64. The build still works (grpc isn't actually used at runtime). 151+ npm vulnerabilities, do not modernize piecemeal — needs a full Vue 3 + Firebase 9+ rewrite as a separate project.

Admin pages most touched are `EditLimitEventView.vue` and `EventCountView.vue` — they read `user_count` / `total_read_time` directly from event parent docs (Phase C cleanup, do not regress to iterating `read_history`).

`vue-project/package.json` `scripts.deploy` runs `npm run build && cd .. && firebase deploy && cd vue-project` — that's `firebase deploy` with no `--only`, so it deploys **everything** in `firebase.json` (functions + rules + indexes + hosting). Prefer `npm run build && firebase deploy --only hosting` to avoid surprise function redeploys.

## Things that look like bugs but aren't

- Many `time_event` / `limit_event` docs have `remain_time=0` and `is_active=true` — events are operationally dormant but data left in place. The single visible time_event (`aKvIlBG1WpSyLVROV2pb`, "나는 행복을 그립니다") was manually deactivated.
- `firebase_dynamic_links` plugin is absent from clients — service discontinued by Google 2025-08-25.
- `bookoc119_books.json` / `bookoc119_titles.txt` at repo root — pre-existing untracked, ignore.
- Node 20 itself was deprecated 2026-04-30 and decommissions 2026-10-30; **upgrade to Node 22 is a known pending task** before that date.
