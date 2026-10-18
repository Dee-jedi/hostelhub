"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { FIRESTORE_DATABASE } from "./env";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const storage = getStorage(app);

/*
 * The browser keeps a copy of everything it has read (IndexedDB). Combined with listeners,
 * reopening the app within ~30 minutes only bills the documents that changed in between,
 * instead of re-reading the whole hostel on every visit.
 */
function firestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        ignoreUndefinedProperties: true,
        localCache:
          typeof window === "undefined" ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
      FIRESTORE_DATABASE,
    );
  } catch {
    return getFirestore(app, FIRESTORE_DATABASE); // already initialized (dev hot reload)
  }
}
export const db = firestore();
