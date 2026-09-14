import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function run() {
  console.log("Starting full audit and recalculation of customer balances and orders...");

  const customersSnap = await db.collection("customers").get();
  const txsSnap = await db.collection("transactions").get();
  const paymentsSnap = await db.collection("payments").get();

  const transactions = txsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
  const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any, isPayment: true }));

  console.log(`Loaded ${customersSnap.size} customers, ${transactions.length} transactions, ${payments.length} payments.`);

  // 1. Correct status and flags on Backup and Active Adjusted Transactions
  let backupsCleaned = 0;
  let activeAdjustedMarked = 0;

  const batchList: admin.firestore.WriteBatch[] = [db.batch()];
  let batchOpCount = 0;

  function addToBatch(ref: admin.firestore.DocumentReference, data: any) {
    if (batchOpCount >= 450) {
      batchList.push(db.batch());
      batchOpCount = 0;
    }
    batchList[batchList.length - 1].update(ref, data);
    batchOpCount++;
  }

  for (const tx of transactions) {
    // A. Check if it's a backup (has isBackup: true or originalTransactionId where parent exists and parent is active)
    if (tx.isBackup || (tx.originalTransactionId && tx.status === 'Adjusted')) {
      const needsStatusFix = tx.status === 'Adjusted';
      const needsRefFix = !tx.referenceOnly || !tx.isBackup || tx.balanceDue !== 0;

      if (needsStatusFix || needsRefFix) {
        const txRef = db.collection("transactions").doc(tx.id);
        const updatePayload: any = {
          isBackup: true,
          referenceOnly: true,
          balanceDue: 0,
          status: 'Original (Archived)'
        };
        addToBatch(txRef, updatePayload);
        backupsCleaned++;
        // update local copy
        tx.isBackup = true;
        tx.referenceOnly = true;
        tx.balanceDue = 0;
        tx.status = 'Original (Archived)';
      }
    }

    // B. If this transaction is an active order that has backups pointing to it, ensure isAdjusted: true
    if (!tx.isBackup && !tx.referenceOnly) {
      const hasBackups = transactions.some(t => t.originalTransactionId === tx.id && (t.isBackup || t.status === 'Original (Archived)'));
      if (hasBackups && !tx.isAdjusted) {
        const txRef = db.collection("transactions").doc(tx.id);
        addToBatch(txRef, { isAdjusted: true });
        activeAdjustedMarked++;
        tx.isAdjusted = true;
      }
    }
  }

  console.log(`Prepared cleanup: ${backupsCleaned} backups updated to 'Original (Archived)', ${activeAdjustedMarked} active orders marked isAdjusted: true.`);

  // 2. Recalculate customer balances and transaction balances
  let customersUpdated = 0;
  let txBalancesUpdated = 0;

  for (const cDoc of customersSnap.docs) {
    const customer = { id: cDoc.id, ...cDoc.data() as any };

    const custTxs = transactions.filter(t => t.customerId === customer.id);
    const custPayments = payments.filter(p => p.customerId === customer.id);

    // Combine and sort chronologically
    const events = [
      ...custTxs.map(t => ({
        ...t,
        isTx: true,
        sortDate: t.date?.toDate ? t.date.toDate() : (t.date?.seconds ? new Date(t.date.seconds * 1000) : (t.date ? new Date(t.date) : new Date(0)))
      })),
      ...custPayments.map(p => ({
        ...p,
        isPayment: true,
        sortDate: p.date?.toDate ? p.date.toDate() : (p.date?.seconds ? new Date(p.date.seconds * 1000) : (p.date ? new Date(p.date) : new Date(0)))
      }))
    ];

    events.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    let runningDebt = customer.openingBalance || 0;

    for (const event of events) {
      if (event.isPayment) {
        runningDebt -= (event.amount || 0);
      } else if (event.isTx) {
        // Backups / reference-only records do NOT affect customer balance
        if (event.isBackup || event.referenceOnly) {
          continue;
        }

        // Voided orders do NOT affect customer balance
        if (event.status === 'Voided') {
          continue;
        }

        if (event.type === 'Credit Sale') {
          const previousBalance = -runningDebt;
          const balanceDue = event.totalAmount - previousBalance;

          if (event.previousBalance !== previousBalance || event.balanceDue !== balanceDue) {
            const txRef = db.collection("transactions").doc(event.id);
            addToBatch(txRef, {
              previousBalance,
              balanceDue
            });
            txBalancesUpdated++;
          }

          runningDebt += event.totalAmount;
        } else if (event.type === 'Stock Return') {
          // Stock returns for Credit Sales reduce customer debt
          // If amountPaid < 0 and original was a Cash Sale, it was refunded directly in cash
          let isCreditSaleReturn = true;
          if (event.originalTransactionId) {
            const orig = transactions.find(t => t.id === event.originalTransactionId);
            if (orig && orig.type === 'Cash Sale') {
              isCreditSaleReturn = false;
            }
          }

          if (isCreditSaleReturn) {
            runningDebt -= (event.totalAmount || 0);
          }
        }
      }
    }

    if (Math.abs((customer.totalDebt || 0) - runningDebt) > 0.01) {
      console.log(`Correcting balance for customer ${customer.name || customer.id}: ${customer.totalDebt} -> ${runningDebt}`);
      const custRef = db.collection("customers").doc(customer.id);
      addToBatch(custRef, { totalDebt: runningDebt });
      customersUpdated++;
    }
  }

  console.log(`Commiting batches: ${batchList.length} batches with updates...`);
  for (let i = 0; i < batchList.length; i++) {
    await batchList[i].commit();
    console.log(`Batch ${i + 1}/${batchList.length} committed.`);
  }

  console.log("RECALCULATION COMPLETE!");
  console.log({
    backupsCleaned,
    activeAdjustedMarked,
    txBalancesUpdated,
    customersUpdated
  });

  process.exit(0);
}
run();
