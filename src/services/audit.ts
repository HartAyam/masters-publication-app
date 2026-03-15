import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Role, Branch } from '@/types';

export const logActivity = async (
  action: string,
  details: string,
  userId: string,
  userRole: Role,
  branchId: Branch | string
) => {
  console.log(`[AuditLog] Attempting to log: ${action} - ${details}`);
  try {
    const docRef = await addDoc(collection(db, 'activity_logs'), {
      action,
      details,
      userId,
      userRole,
      branchId,
      timestamp: serverTimestamp(),
    });
    console.log(`[AuditLog] Logged successfully with ID: ${docRef.id}`);
  } catch (error) {
    console.error("[AuditLog] Error logging activity:", error);
  }
};
