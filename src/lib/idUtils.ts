import { db } from './firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export const formatCurrency = (amount: number) => {
  const formattedNumber = new Intl.NumberFormat('en-GH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `GHS ${formattedNumber}`;
};

export const generateInvoiceId = async (type: string, branchId: string) => {
  const prefixMap: { [key: string]: string } = {
    'Cash Sale': 'CS',
    'Credit Sale': 'CR',
    'Deposit': 'DP',
    'Stock Return': 'RE',
    'Supply Note': 'SN' // Added for completeness
  };

  const prefix = prefixMap[type] || 'IN';
  const branchPrefix = branchId.substring(0, 2).toUpperCase();
  
  const counterRef = doc(db, 'counters', `invoices_${branchId}`);
  
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let count = 0;
    
    if (counterDoc.exists()) {
      count = counterDoc.data().count + 1;
    }
    
    transaction.set(counterRef, { count, updatedAt: serverTimestamp() });
    
    const countStr = count.toString().padStart(3, '0');
    return `${prefix}${branchPrefix}${countStr}`;
  });
};

export const generateUserId = async () => {
  const counterRef = doc(db, 'counters', `users_global`);
  
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let count = 0;
    
    if (counterDoc.exists()) {
      count = counterDoc.data().count + 1;
    }
    
    transaction.set(counterRef, { count, updatedAt: serverTimestamp() });
    
    const countStr = count.toString().padStart(3, '0');
    return `USR${countStr}`;
  });
};

export const generateStaffId = async (branchName: string, role: string) => {
  const roleMap: { [key: string]: string } = {
    'Director': 'DC',
    'Cashier': 'CS',
    'Accountant': 'AC',
    'Driver': 'DV',
    'Marketer': 'MK',
    'Manager': 'MG',
    'Admin': 'AD'
  };

  const roleDesignation = roleMap[role] || 'XX';
  
  // Branch initials: "Atonsu - Gyinyasi" -> "AG"
  // Split by non-alphanumeric characters, filter empty, take first letters
  const branchInitials = branchName
    .split(/[^a-zA-Z0-9]/)
    .filter(word => word.length > 0)
    .map(word => word[0].toUpperCase())
    .join('');

  const counterKey = `staff_${branchInitials}_${roleDesignation}`;
  const counterRef = doc(db, 'counters', counterKey);

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let count = 1;

    if (counterDoc.exists()) {
      count = counterDoc.data().count + 1;
    }

    transaction.set(counterRef, { count, updatedAt: serverTimestamp() });

    const countStr = count.toString().padStart(3, '0');
    return `MP${branchInitials}${roleDesignation}${countStr}`;
  });
};
