import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const p = await db.collection("transactions").doc("CR0R002").get();
  const c = await db.collection("transactions").doc("pn45fbq8EBCITSsnROay").get();
  
  console.log("CR0R002:", JSON.stringify(p.data(), null, 2));
  console.log("pn45fbq8EBCITSsnROay:", JSON.stringify(c.data(), null, 2));
  process.exit(0);
}
run();
