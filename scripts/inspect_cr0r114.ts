import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  // Check CR0R114
  const p = await db.collection("transactions").doc("CR0R114").get();
  const c = await db.collection("transactions").where("originalTransactionId", "==", "CR0R114").get();
  
  console.log("PARENT CR0R114:", {
    id: p.id,
    date: p.data()?.date?.toDate(),
    adjustmentDate: p.data()?.adjustmentDate?.toDate(),
    totalAmount: p.data()?.totalAmount,
    items: p.data()?.items?.map((i: any) => `${i.productName} (${i.quantity})`)
  });

  c.forEach(doc => {
    console.log("CHILD:", {
      id: doc.id,
      date: doc.data()?.date?.toDate(),
      adjustmentDate: doc.data()?.adjustmentDate?.toDate(),
      totalAmount: doc.data()?.totalAmount,
      status: doc.data()?.status,
      isBackup: doc.data()?.isBackup,
      items: doc.data()?.items?.map((i: any) => `${i.productName} (${i.quantity})`)
    });
  });

  process.exit(0);
}
run();
