// Shared client-side Firestore/Storage helpers for the admin UI. Mirrors the
// Vue admin's direct-write model (data protection is Firestore-rules' job —
// tracked separately as security debt). Browser-only; call from "use client".
import {
  getFirebaseDb,
  getFirebaseStorage,
} from "./firebase-client";

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
