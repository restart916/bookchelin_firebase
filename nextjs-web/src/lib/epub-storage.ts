import "server-only";

import { getStorage } from "firebase-admin/storage";

import { adminApp, adminDb } from "./firebase-admin";
import { buildFirebaseDownloadUrl } from "./epub-viewer";

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? "bookchelin.appspot.com";

export interface ResolvedEpub {
  /** Public, fetchable URL for the EPUB file (epubjs `ePub(url)`). */
  url: string;
}

/**
 * Option A (server-side, admin SDK): read `books/{id}.firestore_url` (the
 * Storage object path) and turn it into a fetchable download URL, so the client
 * reader needs no Firebase auth or Storage rules access.
 *
 * Prefers reconstructing the tokenized download URL (identical to the Web SDK's
 * getDownloadURL) from the object's `firebaseStorageDownloadTokens` metadata;
 * falls back to a time-limited signed URL when no token exists.
 *
 * Returns null when the book or its file path is missing.
 */
export async function resolveEpubDownloadUrl(
  bookId: string,
): Promise<ResolvedEpub | null> {
  const snap = await adminDb.collection("books").doc(bookId).get();
  if (!snap.exists) return null;

  const data = snap.data() ?? {};
  const storagePath = data.firestore_url;
  if (typeof storagePath !== "string" || storagePath.trim() === "") {
    return null;
  }

  const bucket = getStorage(adminApp).bucket(STORAGE_BUCKET);
  const file = bucket.file(storagePath);

  const [metadata] = await file.getMetadata();
  const token = readDownloadToken(metadata);
  if (token) {
    return { url: buildFirebaseDownloadUrl(storagePath, token, STORAGE_BUCKET) };
  }

  // No download token on the object — fall back to a short-lived signed URL.
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 6 * 60 * 60 * 1000, // 6h, ample for a reading session
  });
  return { url: signedUrl };
}

function readDownloadToken(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const custom = (metadata as { metadata?: unknown }).metadata;
  if (!custom || typeof custom !== "object") return undefined;
  const tokens = (custom as { firebaseStorageDownloadTokens?: unknown })
    .firebaseStorageDownloadTokens;
  if (typeof tokens !== "string" || tokens === "") return undefined;
  return tokens.split(",")[0];
}
