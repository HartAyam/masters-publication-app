import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const p = await db.collection("transactions").doc("CRLA375").get();
  const c = await db.collection("transactions").doc("08951h2OFHSMbrMRHFko").get();
  console.log("PARENT CRLA375:", JSON.stringify(p.data(), null, 2));
  console.log("CHILD 08951h2OFHSMbrMRHFko:", JSON.stringify(c.data(), null, 2));
  process.exit(0);
}
run();
