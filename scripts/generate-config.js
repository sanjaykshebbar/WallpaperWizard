import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

const envKeys = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)'
};

// Check if critical environment variables are available
if (process.env.VITE_FIREBASE_API_KEY) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(envKeys, null, 2));
    console.log('AdBoard V3 Build: Successfully generated firebase-applet-config.json from Vercel environment variables.');
  } catch (error) {
    console.error('AdBoard V3 Build Error: Failed to write firebase-applet-config.json:', error);
  }
} else {
  console.log('AdBoard V3 Build: No custom VITE_FIREBASE_API_KEY provided in env. Proceeding with static configurations.');
}
