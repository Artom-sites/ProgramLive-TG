const { initializeApp, cert, getApps, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');
const path = require('path');

let serviceAccount;
let useADC = false;
try {
  if (fs.existsSync(path.join(process.cwd(), 'firebase-key.json'))) {
    serviceAccount = require(path.join(process.cwd(), 'firebase-key.json'));
    console.log("Firebase key loaded from ./firebase-key.json");
  } else if (fs.existsSync('/etc/secrets/firebase-key.json')) {
    serviceAccount = require('/etc/secrets/firebase-key.json');
    console.log("Firebase key loaded from /etc/secrets/firebase-key.json");
  } else if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    console.log("Firebase key loaded from env var");
  } else if (process.env.K_SERVICE === 'programlive-staging') {
    useADC = true;
    console.log("Firebase using Cloud Run Application Default Credentials");
  } else {
    throw new Error("No firebase credentials found");
  }
} catch (e) {
  console.error("Firebase config error:", e.message);
  process.exit(1);
}

if (getApps().length === 0) {
  if (useADC) {
    const config = {
      credential: applicationDefault(),
      projectId: 'programlive-staging'
    };
    if (process.env.FIREBASE_STORAGE_BUCKET) {
      config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    }
    initializeApp(config);
  } else {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: 'programlive-7dcf0.firebasestorage.app'
    });
  }
}

const db = getFirestore();
let storage;
try {
  storage = getStorage();
} catch (e) {
  console.log("Storage not initialized (optional)");
}

module.exports = { db, storage };
