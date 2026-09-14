import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  const txsSnap = await db.collection("transactions").get();
  const txsMap = new Map<string, any>();
  txsSnap.forEach(d => txsMap.set(d.id, { id: d.id, ...d.data() }));

  console.log(`Total transactions in DB: ${txsMap.size}`);

  let parentHasIsBackup = 0;
  let childHasIsBackup = 0;
  let parentAdjDateAfterChild = 0;
  let childAdjDateAfterParent = 0;
  let totalPairs = 0;
  let anomalousCases: any[] = [];

  for (const [id, tx] of txsMap.entries()) {
    if (tx.originalTransactionId) {
      totalPairs++;
      const parent = txsMap.get(tx.originalTransactionId);
      if (!parent) {
        anomalousCases.push({ type: "PARENT_MISSING", childId: id, origId: tx.originalTransactionId });
        continue;
      }

      if (parent.isBackup) parentHasIsBackup++;
      if (tx.isBackup) childHasIsBackup++;

      const childAdj = tx.adjustmentDate?.toMillis ? tx.adjustmentDate.toMillis() : (tx.adjustmentDate?.seconds ? tx.adjustmentDate.seconds * 1000 : 0);
      const parentAdj = parent.adjustmentDate?.toMillis ? parent.adjustmentDate.toMillis() : (parent.adjustmentDate?.seconds ? parent.adjustmentDate.seconds * 1000 : 0);

      // Check if parent has adjustmentDate
      if (parentAdj && childAdj) {
        if (parentAdj >= childAdj) parentAdjDateAfterChild++;
        else childAdjDateAfterParent++;
      }

      // Check if parent is marked as backup and child is NOT backup
      if (parent.isBackup && !tx.isBackup) {
        anomalousCases.push({ type: "PARENT_IS_BACKUP_BUT_CHILD_NOT", parentId: parent.id, childId: id });
      }

      // Check if child has 'Adjusted' and parent does not
      // or if child total matches customer balance vs parent total
    }
  }

  console.log({
    totalPairs,
    parentHasIsBackup,
    childHasIsBackup,
    parentAdjDateAfterChild,
    childAdjDateAfterParent,
    anomaliesCount: anomalousCases.length,
    sampleAnomalies: anomalousCases.slice(0, 10)
  });

  process.exit(0);
}
run();
