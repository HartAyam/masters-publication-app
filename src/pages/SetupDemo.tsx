import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { Role, Branch } from '@/types';
import { CheckCircle, XCircle, Loader2, Users, AlertCircle } from 'lucide-react';

const DEMO_USERS = [
  { email: 'admin@demo.com', password: 'password123', role: 'Admin', branchId: 'ALL', name: 'Demo Admin' },
  { email: 'director@demo.com', password: 'password123', role: 'Director', branchId: 'ALL', name: 'Demo Director' },
  { email: 'accountant@demo.com', password: 'password123', role: 'Accountant', branchId: 'ALL', name: 'Demo Accountant' },
  { email: 'manager@demo.com', password: 'password123', role: 'Manager', branchId: 'Gyinyase', name: 'Demo Manager' },
  { email: 'cashier@demo.com', password: 'password123', role: 'Cashier', branchId: 'Gyinyase', name: 'Demo Cashier' },
];

export default function SetupDemo() {
  const [status, setStatus] = useState<{ [key: string]: 'pending' | 'loading' | 'success' | 'error' }>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Firebase Not Configured</h1>
          <p className="text-gray-600 mb-6">Please set up your Firebase environment variables first.</p>
          <a href="/login" className="text-blue-600 hover:underline">Back to Login</a>
        </div>
      </div>
    );
  }

  const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

  const createDemoUsers = async () => {
    setIsProcessing(true);
    setLogs([]);
    
    // Initialize status
    const initialStatus: any = {};
    DEMO_USERS.forEach(u => initialStatus[u.email] = 'pending');
    setStatus(initialStatus);

    for (const user of DEMO_USERS) {
      setStatus(prev => ({ ...prev, [user.email]: 'loading' }));
      addLog(`Creating ${user.role}: ${user.email}...`);

      try {
        let uid;
        
        try {
          // 1. Try to Create Auth User
          const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
          uid = userCredential.user.uid;
          addLog(`✅ Created Auth user: ${user.email}`);
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            addLog(`⚠️ User ${user.email} already exists in Auth. Attempting to update profile...`);
            // If user exists, sign in to get UID
            try {
              const userCredential = await import('firebase/auth').then(m => m.signInWithEmailAndPassword(auth, user.email, user.password));
              uid = userCredential.user.uid;
            } catch (signInError: any) {
              if (signInError.code === 'auth/invalid-credential') {
                throw new Error(`Invalid credentials for existing user ${user.email}. Please check the password.`);
              }
              throw new Error(`Could not sign in existing user: ${signInError.message}`);
            }
          } else {
            throw authError;
          }
        }

        if (uid) {
          // 2. Create/Overwrite Firestore Profile
          await setDoc(doc(db, 'users', uid), {
            uid,
            email: user.email,
            displayName: user.name,
            role: user.role as Role,
            branchId: user.branchId as Branch,
            createdAt: serverTimestamp()
          });
          addLog(`✅ Firestore profile updated for ${user.email}`);
          setStatus(prev => ({ ...prev, [user.email]: 'success' }));
        }

        // 3. Sign out to prepare for next creation
        await signOut(auth);

      } catch (error: any) {
        console.error(error);
        addLog(`❌ Error processing ${user.email}: ${error.message}`);
        setStatus(prev => ({ ...prev, [user.email]: 'error' }));
      }
      
      // Small delay to prevent rate limiting or race conditions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsProcessing(false);
    addLog('🏁 Demo setup complete!');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-full">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Setup Demo Accounts</h1>
            <p className="text-gray-500 text-sm">Create test users for all roles automatically.</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> This process will create 5 user accounts in your Firebase Auth and Firestore. 
            The password for all accounts will be <code>password123</code>.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {DEMO_USERS.map((user) => (
            <div key={user.email} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{user.role} <span className="text-gray-400 text-xs">({user.branchId})</span></p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {status[user.email] === 'loading' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                {status[user.email] === 'success' && <CheckCircle className="h-5 w-5 text-green-500" />}
                {status[user.email] === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                {(!status[user.email] || status[user.email] === 'pending') && <span className="text-xs text-gray-400">Pending</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs h-40 overflow-y-auto mb-6">
          {logs.length === 0 ? <span className="text-gray-600">// Logs will appear here...</span> : logs.map((log, i) => <div key={i}>{log}</div>)}
        </div>

        <button
          onClick={createDemoUsers}
          disabled={isProcessing}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Creating Users...</> : 'Start Setup'}
        </button>
        
        <div className="mt-4 text-center">
            <a href="/login" className="text-sm text-blue-600 hover:underline">Back to Login</a>
        </div>
      </div>
    </div>
  );
}
