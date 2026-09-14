import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").get();
  for (const doc of txs.docs) {
    const d = doc.data();
    if (d.isBackup || d.referenceOnly || d.isAdjusted || d.status === 'Adjusted') {
      console.log("Found:", doc.id, "Type:", d.type, "Status:", d.status, "isBackup:", d.isBackup, "isAdjusted:", d.isAdjusted, "origTxId:", d.originalTransactionId, "totalAmount:", d.totalAmount, "customer:", d.customerName);
    }
  }
  process.exit(0);
}
run();
