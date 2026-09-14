import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const logs = await db.collection("activityLogs").where("action", "==", "Order Adjusted").limit(20).get();
  console.log("Activity logs for Order Adjusted:", logs.size);
  logs.forEach(doc => {
    console.log(doc.id, JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}
run();
