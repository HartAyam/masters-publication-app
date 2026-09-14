import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const custId = "DN4t1xnZ3HkBktcwyrUb";
  const txs = await db.collection("transactions").where("customerId", "==", custId).get();
  txs.forEach(d => {
    console.log(d.id, d.data().type, d.data().status, "total:", d.data().totalAmount, "isBackup:", d.data().isBackup, "origId:", d.data().originalTransactionId);
  });
  process.exit(0);
}
run();
