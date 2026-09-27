const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snapshot = await db.collection('programs').limit(5).get();
  snapshot.forEach(doc => {
    console.log("ID:", doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}
run();
