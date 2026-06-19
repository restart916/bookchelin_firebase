import "server-only";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const adminApp =
  getApps()[0] ??
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "bookchelin",
  });

export const adminDb = getFirestore(adminApp);
