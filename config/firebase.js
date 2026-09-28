const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');
const path = require('path');

let serviceAccount;
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
  } else {
    throw new Error("No firebase credentials found");
  }
} catch (e) {
  console.error("Firebase config error:", e.message);
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'programlive-7dcf0.firebasestorage.app'
  });
}

const db = getFirestore();
const storage = getStorage();

module.exports = { db, storage };
