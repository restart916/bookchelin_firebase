// Shared client-side Firestore/Storage helpers for the admin UI. Mirrors the
// Vue admin's direct-write model (data protection is Firestore-rules' job —
// tracked separately as security debt). Browser-only; call from "use client".
import type { DocumentSnapshot, QueryConstraint, WhereFilterOp } from "firebase/firestore";
import {
  getFirebaseApp,
  getFirebaseDb,
  getFirebaseStorage,
} from "./firebase-client";

export type { DocumentSnapshot };

export interface DocRow {
  id: string;
  [key: string]: unknown;
}

export type OrderDir = "asc" | "desc";

/** Read a whole collection, optionally ordered. */
export async function listDocs(
  path: string,
  order?: { field: string; dir?: OrderDir },
): Promise<DocRow[]> {
  const db = await getFirebaseDb();
  const { collection, getDocs, orderBy, query } = await import(
    "firebase/firestore"
  );
  const ref = collection(db, path);
  const snap = order
    ? await getDocs(query(ref, orderBy(order.field, order.dir ?? "asc")))
    : await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Read documents whose ID falls in [startId, endId] (inclusive), ordered by
 * document id. Either bound may be null for an open range. Used by the
 * dayly_total_time range query (doc IDs are 'YYYY-MM-DD', so lexical = chrono).
 */
export async function listDocsByIdRange(
  path: string,
  startId: string | null,
  endId: string | null,
): Promise<DocRow[]> {
  const db = await getFirebaseDb();
  const { collection, documentId, endAt, getDocs, orderBy, query, startAt } =
    await import("firebase/firestore");
  let q = query(collection(db, path), orderBy(documentId()));
  if (startId) q = query(q, startAt(startId));
  if (endId) q = query(q, endAt(endId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Server-side document count, optionally filtered by an equality match. Uses
 * Firestore's count aggregation so it never downloads the documents — far
 * cheaper than reading a whole collection just to count (e.g. click logs).
 */
export async function countDocs(
  path: string,
  match?: { field: string; value: unknown },
): Promise<number> {
  const db = await getFirebaseDb();
  const { collection, getCountFromServer, query, where } = await import(
    "firebase/firestore"
  );
  const ref = collection(db, path);
  const q = match ? query(ref, where(match.field, "==", match.value)) : query(ref);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export interface PaginatedResult {
  docs: DocRow[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Cursor-based paginated read. Never loads the full collection — fetches one
 * page at a time. Pass `startAfter` (last doc from previous page) to advance.
 * Supports optional where-clauses and a single orderBy field.
 */
export async function listDocsPaginated(
  path: string,
  {
    pageSize = 25,
    startAfter = null,
    whereClauses = [],
    orderField,
    orderDir = "desc",
  }: {
    pageSize?: number;
    startAfter?: DocumentSnapshot | null;
    whereClauses?: Array<[string, WhereFilterOp, unknown]>;
    orderField?: string;
    orderDir?: OrderDir;
  } = {},
): Promise<PaginatedResult> {
  const db = await getFirebaseDb();
  const {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter: saFn,
    where,
  } = await import("firebase/firestore");

  const constraints: QueryConstraint[] = [];
  if (orderField) constraints.push(orderBy(orderField, orderDir));
  for (const [field, op, value] of whereClauses) {
    constraints.push(where(field, op as WhereFilterOp, value));
  }
  constraints.push(limit(pageSize));
  if (startAfter) constraints.push(saFn(startAfter));

  const snap = await getDocs(query(collection(db, path), ...constraints));
  return {
    docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

/**
 * Fetch specific documents by ID. Batches into chunks of 30 to stay within
 * the Firestore `in` operator limit. Returns docs in arbitrary order.
 */
export async function getDocsByIds(
  path: string,
  ids: string[],
): Promise<DocRow[]> {
  if (ids.length === 0) return [];
  const db = await getFirebaseDb();
  const { collection, documentId, getDocs, query, where } = await import(
    "firebase/firestore"
  );
  const CHUNK = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      getDocs(
        query(collection(db, path), where(documentId(), "in", chunk)),
      ).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ),
  );
  return results.flat();
}

/** Call an onCall Cloud Function (default region us-central1) and return its data. */
export async function callFunction<T = unknown>(
  name: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(getFirebaseApp());
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data as T;
}

/** Read a single document, or null if missing. */
export async function getDocById(
  path: string,
  id: string,
): Promise<DocRow | null> {
  const db = await getFirebaseDb();
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Create a document, returning its new id. */
export async function addDocTo(
  path: string,
  data: Record<string, unknown>,
): Promise<string> {
  const db = await getFirebaseDb();
  const { addDoc, collection } = await import("firebase/firestore");
  const ref = await addDoc(collection(db, path), data);
  return ref.id;
}

/** Update (merge) a document. */
export async function updateDocAt(
  path: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const db = await getFirebaseDb();
  const { doc, updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(db, path, id), data);
}

/** Create-or-overwrite a document at a known id. */
export async function setDocAt(
  path: string,
  id: string,
  data: Record<string, unknown>,
  merge = true,
): Promise<void> {
  const db = await getFirebaseDb();
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, path, id), data, { merge });
}

/** Delete a document. */
export async function deleteDocAt(path: string, id: string): Promise<void> {
  const db = await getFirebaseDb();
  const { deleteDoc, doc } = await import("firebase/firestore");
  await deleteDoc(doc(db, path, id));
}

/** Upload a file to Storage at `storagePath` (overwrites); returns the download URL. */
export async function uploadToStorage(
  storagePath: string,
  file: File | Blob,
): Promise<string> {
  const storage = await getFirebaseStorage();
  const { getDownloadURL, ref, uploadBytes } = await import("firebase/storage");
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

/** Coerce an unknown Firestore value to string for form inputs. */
export function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Coerce an unknown Firestore value to a number (NaN-safe). */
export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
