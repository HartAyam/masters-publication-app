import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const custId = "BpxHOeiGeQFd4rN5Cthm";
  const custDoc = await db.collection("customers").doc(custId).get();
  console.log("Customer:", custDoc.data());

  const txs = await db.collection("transactions").where("customerId", "==", custId).get();
  console.log(`Found ${txs.size} transactions:`);
  txs.forEach(d => {
    const data = d.data();
    console.log({
      id: d.id,
      type: data.type,
      status: data.status,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid,
      balanceDue: data.balanceDue,
      previousBalance: data.previousBalance,
      isBackup: data.isBackup,
      referenceOnly: data.referenceOnly,
      isAdjusted: data.isAdjusted,
      originalTransactionId: data.originalTransactionId,
      date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
      adjustmentDate: data.adjustmentDate?.toDate ? data.adjustmentDate.toDate().toISOString() : data.adjustmentDate,
    });
  });
  process.exit(0);
}
run();
