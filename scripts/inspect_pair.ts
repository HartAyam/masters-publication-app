import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const doc1 = await db.collection("transactions").doc("a7fA3gL4zN0e5wP2").get();
  const doc2 = await db.collection("transactions").doc("b8gB4hM5aO1f6xQ3").get();
  
  console.log("DOC 1 (a7fA3gL4zN0e5wP2):", JSON.stringify(doc1.data(), null, 2));
  console.log("DOC 2 (b8gB4hM5aO1f6xQ3):", JSON.stringify(doc2.data(), null, 2));
  process.exit(0);
}
run();
