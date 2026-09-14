import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const targetId = "CR0R114"; // from zREWfjLxDF7W8WT54iDv: origTxId: CR0R114, customer: INTEGRITY SCHOOL
  const docSnap = await db.collection("transactions").doc(targetId).get();
  console.log("Original Doc ID:", targetId, "Exists:", docSnap.exists);
  if (docSnap.exists) {
    console.log("Doc data:", JSON.stringify(docSnap.data(), null, 2));
  }

  const querySnap = await db.collection("transactions").where("originalTransactionId", "==", targetId).get();
  console.log("Query matching origTxId == " + targetId + ":", querySnap.size);
  querySnap.forEach(d => {
    console.log("Matched Doc:", d.id, JSON.stringify(d.data(), null, 2));
  });

  process.exit(0);
}
run();
