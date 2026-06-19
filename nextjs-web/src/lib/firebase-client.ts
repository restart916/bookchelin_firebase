import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyAsR8ZKo1ty2mLVvGv_8lsLR-q-1UEJatQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "bookchelin.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? "https://bookchelin.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "bookchelin",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "bookchelin.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "658686940034",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:658686940034:web:2a08fc1241723df936359b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-XCM430STF8",
};

/** Shared client Firebase app (browser only). */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

let cachedAuth: Auth | null = null;
export async function getFirebaseAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase/auth");
  cachedAuth ??= getAuth(getFirebaseApp());
  return cachedAuth;
}

let cachedDb: Firestore | null = null;
export async function getFirebaseDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase/firestore");
  cachedDb ??= getFirestore(getFirebaseApp());
  return cachedDb;
}

let cachedStorage: FirebaseStorage | null = null;
export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  const { getStorage } = await import("firebase/storage");
  cachedStorage ??= getStorage(getFirebaseApp());
  return cachedStorage;
}

export async function getBookchelinAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;

  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;

  return getAnalytics(getFirebaseApp());
}
