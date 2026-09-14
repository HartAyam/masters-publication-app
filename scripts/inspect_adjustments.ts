import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txs = await db.collection("transactions").get();
  console.log("Total txs:", txs.size);
  
  const relatedTxs: any[] = [];
  txs.forEach(doc => {
    const d = doc.data();
    if (d.isBackup || d.referenceOnly || d.isAdjusted || d.status === 'Adjusted' || d.originalTransactionId) {
      relatedTxs.push({ id: doc.id, ...d });
    }
  });

  console.log(`Found ${relatedTxs.length} related transactions:`);
  for (const t of relatedTxs) {
    console.log("------------------------------------------");
    console.log("ID:", t.id);
    console.log("Type:", t.type, "Status:", t.status);
    console.log("Customer:", t.customerName, "(ID:", t.customerId, ")");
    console.log("TotalAmount:", t.totalAmount, "AmountPaid:", t.amountPaid);
    console.log("BalanceDue:", t.balanceDue, "PreviousBalance:", t.previousBalance);
    console.log("isBackup:", t.isBackup, "referenceOnly:", t.referenceOnly, "isAdjusted:", t.isAdjusted);
    console.log("originalTransactionId:", t.originalTransactionId);
    console.log("Notes:", t.notes);
    console.log("Date:", t.date ? (t.date.toDate ? t.date.toDate().toISOString() : t.date) : null);
    console.log("AdjustmentDate:", t.adjustmentDate ? (t.adjustmentDate.toDate ? t.adjustmentDate.toDate().toISOString() : t.adjustmentDate) : null);
    console.log("Items count:", t.items?.length);
    if (t.items?.length) {
      console.log("Items summary:", t.items.map((i: any) => `${i.productName} (qty ${i.quantity}, total ${i.total})`).join("; "));
    }
  }
  process.exit(0);
}
run();
