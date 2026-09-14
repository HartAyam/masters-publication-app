import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const docSnap = await db.collection("transactions").doc("CR0R114").get();
  console.log("CR0R114:", JSON.stringify(docSnap.data(), null, 2));
  process.exit(0);
}
run();
