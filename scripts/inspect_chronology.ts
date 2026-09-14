import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").where("originalTransactionId", "!=", null).limit(10).get();
  for (const doc of txs.docs) {
    const child = doc.data();
    const parentId = child.originalTransactionId;
    const parentDoc = await db.collection("transactions").doc(parentId).get();
    console.log("--------------------------------------------------");
    console.log("Child ID:", doc.id);
    console.log("Child Date:", child.date?.toDate ? child.date.toDate() : child.date);
    console.log("Child AdjDate:", child.adjustmentDate?.toDate ? child.adjustmentDate.toDate() : child.adjustmentDate);
    console.log("Child status:", child.status, "isBackup:", child.isBackup, "isAdjusted:", child.isAdjusted, "refOnly:", child.referenceOnly);
    console.log("Child totalAmount:", child.totalAmount, "balanceDue:", child.balanceDue);
    console.log("Child items:", child.items?.map((i: any) => `${i.productName} (${i.quantity})`).join(", "));
    
    if (parentDoc.exists) {
      const parent = parentDoc.data()!;
      console.log("Parent ID:", parentDoc.id);
      console.log("Parent Date:", parent.date?.toDate ? parent.date.toDate() : parent.date);
      console.log("Parent AdjDate:", parent.adjustmentDate?.toDate ? parent.adjustmentDate.toDate() : parent.adjustmentDate);
      console.log("Parent status:", parent.status, "isBackup:", parent.isBackup, "isAdjusted:", parent.isAdjusted, "refOnly:", parent.referenceOnly);
      console.log("Parent totalAmount:", parent.totalAmount, "balanceDue:", parent.balanceDue);
      console.log("Parent items:", parent.items?.map((i: any) => `${i.productName} (${i.quantity})`).join(", "));
    } else {
      console.log("Parent DOES NOT EXIST for", parentId);
    }
  }
  process.exit(0);
}
run();
