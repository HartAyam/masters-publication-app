import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const p = await db.collection("transactions").doc("hbNX2uvAy59D41fEH07h").get();
  const c = await db.collection("transactions").doc("5MFX2Z8xyDxa69AsjKsG").get();
  console.log("Parent hbNX2uvAy59D41fEH07h:", JSON.stringify(p.data(), null, 2));
  console.log("Child 5MFX2Z8xyDxa69AsjKsG:", JSON.stringify(c.data(), null, 2));
  process.exit(0);
}
run();
