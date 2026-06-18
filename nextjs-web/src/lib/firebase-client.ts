import { getApp, getApps, initializeApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";

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

export async function getBookchelinAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;

  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAnalytics(app);
}
