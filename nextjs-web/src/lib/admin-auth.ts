// Admin access control (Google sign-in + email whitelist), ported from the Vue
// admin's admin_auth.js. This gates the admin UI only; data protection is the
// job of Firestore rules (tracked separately as security debt).
import type { User } from "firebase/auth";

import { getFirebaseAuth } from "./firebase-client";

// Google accounts allowed into the admin. Add emails here to grant access.
export const ADMIN_EMAILS = [
  "restart916@gmail.com",
  "helgi2019@gmail.com",
];

export function isAdmin(user: Pick<User, "email"> | null | undefined): boolean {
  return !!user?.email && ADMIN_EMAILS.includes(user.email);
}

export async function signInWithGoogle(): Promise<User> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export async function signOutAdmin(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

/**
 * Subscribe to auth state. Calls back with the current user (or null) and on
 * every change. Returns an unsubscribe function.
 */
export async function watchAuth(
  cb: (user: User | null) => void,
): Promise<() => void> {
  const auth = await getFirebaseAuth();
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(auth, cb);
}
