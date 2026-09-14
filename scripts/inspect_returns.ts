import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const returns = await db.collection("transactions").where("type", "==", "Stock Return").get();
  console.log(`Total Stock Returns: ${returns.size}`);
  const sample = returns.docs.slice(0, 10).map(d => {
    const data = d.data();
    return {
      id: d.id,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid,
      customerId: data.customerId,
      origId: data.originalTransactionId,
      status: data.status
    };
  });
  console.log("Sample stock returns:", sample);
  process.exit(0);
}
run();
