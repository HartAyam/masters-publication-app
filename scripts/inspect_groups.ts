import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").get();
  
  // Group by originalTransactionId or id
  const groups: { [key: string]: any[] } = {};
  
  txs.forEach(doc => {
    const d = doc.data();
    if (d.originalTransactionId) {
      if (!groups[d.originalTransactionId]) groups[d.originalTransactionId] = [];
      groups[d.originalTransactionId].push({ id: doc.id, ...d });
    }
  });

  console.log(`Found ${Object.keys(groups).length} originalTransactionIds with related docs:`);
  
  const sampleKeys = Object.keys(groups).slice(0, 5);
  for (const origId of sampleKeys) {
    const origDoc = await db.collection("transactions").doc(origId).get();
    console.log("==================================================");
    console.log("PARENT ID (origTxId in children):", origId);
    if (origDoc.exists) {
      const od = origDoc.data()!;
      console.log("Parent Doc:", {
        id: origDoc.id,
        type: od.type,
        status: od.status,
        totalAmount: od.totalAmount,
        amountPaid: od.amountPaid,
        balanceDue: od.balanceDue,
        previousBalance: od.previousBalance,
        isBackup: od.isBackup,
        isAdjusted: od.isAdjusted,
        referenceOnly: od.referenceOnly,
        date: od.date?.toDate ? od.date.toDate().toISOString() : od.date,
        adjustmentDate: od.adjustmentDate?.toDate ? od.adjustmentDate.toDate().toISOString() : od.adjustmentDate,
        notes: od.notes,
        itemsCount: od.items?.length
      });
    } else {
      console.log("Parent Doc DOES NOT EXIST");
    }
    
    console.log("Related Docs count:", groups[origId].length);
    for (const rd of groups[origId]) {
      console.log("  Child Doc:", {
        id: rd.id,
        type: rd.type,
        status: rd.status,
        totalAmount: rd.totalAmount,
        amountPaid: rd.amountPaid,
        balanceDue: rd.balanceDue,
        previousBalance: rd.previousBalance,
        isBackup: rd.isBackup,
        isAdjusted: rd.isAdjusted,
        referenceOnly: rd.referenceOnly,
        date: rd.date?.toDate ? rd.date.toDate().toISOString() : rd.date,
        adjustmentDate: rd.adjustmentDate?.toDate ? rd.adjustmentDate.toDate().toISOString() : rd.adjustmentDate,
        notes: rd.notes,
        itemsCount: rd.items?.length
      });
    }
  }
  process.exit(0);
}
run();
