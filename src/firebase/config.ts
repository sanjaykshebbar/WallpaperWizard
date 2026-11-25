/**
 * ==========================================
 * File: src/firebase/config.ts
 * Project: AdBoard V3
 * Purpose:
 * Initialises current Firebase application instance
 * and connection checks.
 * ==========================================
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialise Firebase App safely to avoid pre-existing instance crashes
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Exports for direct Firestore, Authentication, and Storage modules
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const isPlaceholder = 
  firebaseConfig.apiKey.includes('Placeholder') || 
  firebaseConfig.projectId.includes('placeholder');

/**
 * Validates connection to active Firestore Database
 *
 * Purpose:
 * Verifies that the client can communicate with Firestore or flags a warning
 * if the project environment is offline/misconfigured.
 */
async function testConnection(): Promise<void> {
  if (isPlaceholder) {
    console.info("AdBoard V3: Running local development sandbox mode with offline Web storage. Configure Firestore via set_up_firebase for live cloud synchronization.");
    return;
  }

  try {
    // Attempt standard single-read from the test connection path
    await getDocFromServer(doc(db, 'config', 'init'));
    console.log("AdBoard V3: Firestore connection successfully audited.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("AdBoard V3 warning: Please check your active Firebase config. Database client is offline.");
    } else {
      console.warn("AdBoard V3 connection warning, using modular setup flow:", error);
    }
  }
}

// Fire network connection audit
testConnection();
