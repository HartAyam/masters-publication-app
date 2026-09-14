import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const logs = await db.collection("activityLogs").limit(10).get();
  console.log("Total activity logs sample:", logs.size);
  logs.forEach(doc => {
    console.log(doc.id, doc.data().action, doc.data().details);
  });
  process.exit(0);
}
run();
