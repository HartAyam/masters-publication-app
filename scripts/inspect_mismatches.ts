import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const mismatchIds = [
    'DN4t1xnZ3HkBktcwyrUb',
    'I1HQ4U2g0fEYXtjKZdkK',
    'LE9i8yNNUdm5vp8JJFfI',
    'U2XUn3yLs00GtWcCxiGJ',
    'aIeZndXFK75aN575phUa',
    'aQbM8n5KiDKDqJl7hZgQ',
    'aeyobRFFNGMpUYGEC0Kh',
    'fuh3q2Y9RBkgEpPJImQq',
    'lw1qeaeouEtkjkry45xB',
    's7zGsWQi5uIC87BRraSl',
    's9wtwcB53Vc0Nh4LB4kj',
    'sjwriSDKYplc0SdUh4Bu'
  ];

  for (const id of mismatchIds) {
    const custDoc = await db.collection("customers").doc(id).get();
    const cust = custDoc.data()!;
    const txsSnap = await db.collection("transactions").where("customerId", "==", id).get();
    const paysSnap = await db.collection("payments").where("customerId", "==", id).get();

    console.log("==================================================");
    console.log(`CUSTOMER: ${cust.name} (${id}) - Stored totalDebt: ${cust.totalDebt}, OpeningBalance: ${cust.openingBalance}`);
    
    console.log("TRANSACTIONS:");
    txsSnap.forEach(d => {
      const t = d.data();
      console.log(`  Tx ${d.id}: type=${t.type}, status=${t.status}, total=${t.totalAmount}, paid=${t.amountPaid}, balDue=${t.balanceDue}, isBackup=${t.isBackup}, isAdj=${t.isAdjusted}, origId=${t.originalTransactionId}`);
    });

    console.log("PAYMENTS:");
    paysSnap.forEach(d => {
      const p = d.data();
      console.log(`  Pay ${d.id}: amount=${p.amount}`);
    });
  }
  process.exit(0);
}
run();
