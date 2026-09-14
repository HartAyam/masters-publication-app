import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").get();
  console.log("Total transactions:", txs.size);
  txs.forEach(doc => {
    const d = doc.data();
    console.log("TX:", doc.id, JSON.stringify({
      type: d.type,
      status: d.status,
      customerName: d.customerName,
      customerId: d.customerId,
      totalAmount: d.totalAmount,
      balanceDue: d.balanceDue,
      previousBalance: d.previousBalance,
      isBackup: d.isBackup,
      referenceOnly: d.referenceOnly,
      isAdjusted: d.isAdjusted,
      originalTransactionId: d.originalTransactionId,
      date: d.date ? (d.date.toDate ? d.date.toDate() : d.date) : null
    }));
  });
  const custs = await db.collection("customers").get();
  console.log("\nTotal customers:", custs.size);
  custs.forEach(doc => {
    const c = doc.data();
    console.log("CUST:", doc.id, c.name, "totalDebt:", c.totalDebt, "openingBalance:", c.openingBalance);
  });
  process.exit(0);
}
run();
