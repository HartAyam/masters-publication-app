import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").get();
  let withBackup = 0;
  let withRefOnly = 0;
  let withIsAdjusted = 0;
  let withStatusAdjusted = 0;
  let withOrigId = 0;
  
  txs.forEach(doc => {
    const d = doc.data();
    if (d.isBackup) withBackup++;
    if (d.referenceOnly) withRefOnly++;
    if (d.isAdjusted) withIsAdjusted++;
    if (d.status === 'Adjusted') withStatusAdjusted++;
    if (d.originalTransactionId) withOrigId++;
  });

  console.log({
    total: txs.size,
    withBackup,
    withRefOnly,
    withIsAdjusted,
    withStatusAdjusted,
    withOrigId
  });
  process.exit(0);
}
run();
