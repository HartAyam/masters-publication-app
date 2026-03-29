import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, setDoc, doc, getDocs, updateDoc, deleteDoc, writeBatch, query } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { ROLES, isGlobalUser } from '@/lib/utils';
import { useBranches } from '@/hooks/useBranches';
import { generateUserId } from '@/lib/idUtils';
import { Edit2, Trash2, X, Save, RefreshCw, AlertTriangle, Database, Key } from 'lucide-react';
import { UserProfile } from '@/types';
import { Modal, ConfirmModal } from '@/components/common/Modal';

export default function Admin() {
  const { userProfile, user } = useAuth();
  const { branches: dbBranches, loading: branchesLoading } = useBranches();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editBranch, setEditBranch] = useState('');

  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePassword, setPurgePassword] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);

  // Password Reset & Change States
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [changePasswordTarget, setChangePasswordTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Delete User State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success/Error Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [systemHealth, setSystemHealth] = useState<{ status: 'loading' | 'ok' | 'error', details?: any } | null>(null);

  useEffect(() => {
    fetchUsers();
    checkSystemHealth();
  }, []);

  useEffect(() => {
    if (dbBranches.length > 0 && !branch) {
      setBranch(dbBranches[0].id);
    }
  }, [dbBranches, branch]);

  const checkSystemHealth = async () => {
    if (!user) return;
    setSystemHealth({ status: 'loading' });
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/admin/check-permissions?adminToken=${idToken}`);
      const data = await response.json();
      
      if (response.ok && data.firestoreStatus === 'OK') {
        setSystemHealth({ status: 'ok', details: data });
      } else {
        setSystemHealth({ status: 'error', details: data });
      }
    } catch (error: any) {
      setSystemHealth({ status: 'error', details: { error: error.message } });
    }
  };

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage('');

    try {
      const customId = await generateUserId();
      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName,
          role,
          branchId: branch,
          customId,
          adminToken: idToken
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create user');

      setMessage(`User ${email} created successfully with ID: ${customId}`);
      setEmail('');
      setDisplayName('');
      setPassword('');
      fetchUsers();
    } catch (error: any) {
      console.error(error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (user: UserProfile) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditDisplayName(user.displayName || '');
    setEditRole(user.role);
    setEditBranch(user.branchId);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !user) return;
    setLoading(true);
    try {
      // 1. Update Auth Email if it changed
      if (editEmail !== editingUser.email) {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/admin/update-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: editingUser.uid,
            email: editEmail,
            adminToken: idToken
          })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update user in Auth');
      }

      // 2. Update Firestore Profile
      await updateDoc(doc(db, 'users', editingUser.uid), {
        email: editEmail,
        displayName: editDisplayName,
        role: editRole,
        branchId: isGlobalUser(editRole) ? 'Gyinyase' : editBranch,
      });

      setFeedback({ type: 'success', message: 'User updated successfully in both Auth and Database.' });
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      setFeedback({ type: 'error', message: `Failed to update user: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !auth) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetTarget);
      setFeedback({ type: 'success', message: `Password reset email sent to ${resetTarget}. Please check the inbox (and spam folder).` });
    } catch (error: any) {
      console.error("Error sending reset email:", error);
      setFeedback({ type: 'error', message: `Failed to send reset email: ${error.message}` });
    } finally {
      setLoading(false);
      setResetTarget(null);
    }
  };

  const handleChangePasswordDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePasswordTarget || !newPassword || !user) return;
    
    setIsChangingPassword(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: changePasswordTarget.uid,
          newPassword,
          adminToken: idToken
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update password');

      setFeedback({ type: 'success', message: `Password for ${changePasswordTarget.email} updated successfully.` });
      setChangePasswordTarget(null);
      setNewPassword('');
    } catch (error: any) {
      console.error("Error changing password:", error);
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || !user) return;
    setIsDeleting(true);
    try {
      const idToken = await user.getIdToken();
      
      // 1. Delete from Auth via Server
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: deleteTarget,
          adminToken: idToken
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete user from Auth');

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'users', deleteTarget));
      
      setFeedback({ type: 'success', message: 'User deleted successfully from both Auth and Database.' });
      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      setFeedback({ type: 'error', message: `Failed to delete user: ${error.message}` });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handlePurgeDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser?.email) return;

    setPurgeLoading(true);
    try {
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(auth.currentUser.email, purgePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
    } catch (error: any) {
      console.error("Re-authentication failed:", error);
      if (error.code === 'auth/invalid-credential') {
        setFeedback({ type: 'error', message: 'Invalid password. Re-authentication failed.' });
      } else {
        setFeedback({ type: 'error', message: `Authentication failed: ${error.message}` });
      }
      setPurgeLoading(false);
      return;
    }

    try {
      const collections = ['transactions', 'products', 'expenses', 'payments', 'activity_logs', 'payroll', 'customers', 'suppliers', 'branches'];
      
      for (const collName of collections) {
        const snap = await getDocs(collection(db, collName));
        const batch = writeBatch(db);
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }

      setFeedback({ type: 'success', message: 'Database purged successfully. All collections have been cleared.' });
      setShowPurgeModal(false);
      setPurgePassword('');
      fetchUsers();
    } catch (error: any) {
      console.error("Purge error:", error);
      setFeedback({ type: 'error', message: `Purge failed: ${error.message}` });
    } finally {
      setPurgeLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
          {systemHealth && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              systemHealth.status === 'ok' ? 'bg-green-100 text-green-700' : 
              systemHealth.status === 'loading' ? 'bg-blue-100 text-blue-700' : 
              'bg-red-100 text-red-700'
            }`}>
              <RefreshCw size={12} className={systemHealth.status === 'loading' ? 'animate-spin' : ''} />
              {systemHealth.status === 'ok' ? 'System Healthy' : 
               systemHealth.status === 'loading' ? 'Checking System...' : 
               'System Permission Error'}
              {systemHealth.status === 'error' && (
                <button 
                  onClick={() => alert(`System Diagnostics:\n\nProject: ${systemHealth.details?.projectId}\nFirestore: ${systemHealth.details?.firestoreStatus}\nAuth: ${systemHealth.details?.authUpdateStatus}\n\nThis usually means the server lacks IAM permissions. Please ensure the Firebase Admin SDK is correctly configured.`)}
                  className="ml-1 underline"
                >
                  Details
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowPurgeModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          <Database size={18} /> Purge Database
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">Create New User</h2>
            {message && <div className="p-3 bg-blue-50 text-blue-700 rounded-lg mb-4 text-sm">{message}</div>}
            
            <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                type="text"
                required
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">System Status</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Total Users</span>
                <span className="font-bold">{users.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Active Branches</span>
                <span className="font-bold">{dbBranches.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Database Status</span>
                <span className="font-bold text-green-600">Connected</span>
              </div>
              <div className="pt-4">
                <button
                  onClick={() => setShowPurgeModal(true)}
                  className="w-full py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <AlertTriangle size={18} />
                  Purge Database
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Manage Users</h2>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-4 font-medium text-gray-600">Display Name</th>
                    <th className="p-4 font-medium text-gray-600">Email</th>
                    <th className="p-4 font-medium text-gray-600">Role</th>
                    <th className="p-4 font-medium text-gray-600">Branch</th>
                    <th className="p-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.uid} className="hover:bg-gray-50">
                      <td className="p-4 text-gray-900 font-medium">{user.displayName || '-'}</td>
                      <td className="p-4 text-gray-900">{user.email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 
                            user.role === 'Director' ? 'bg-blue-100 text-blue-700' : 
                            'bg-gray-100 text-gray-700'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">
                        {dbBranches.find(b => b.id === user.branchId || b.name === user.branchId)?.name || user.branchId}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleEditClick(user)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit User"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => setChangePasswordTarget(user)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Change Password Directly"
                          >
                            <Key size={16} />
                          </button>
                          <button 
                            onClick={() => setResetTarget(user.email)}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Send Reset Email"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button 
                            onClick={() => setDeleteTarget(user.uid)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editRole}
                    onChange={e => setEditRole(e.target.value)}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editBranch}
                    onChange={e => setEditBranch(e.target.value as any)}
                    disabled={isGlobalUser(editRole)}
                  >
                    {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedback && (
        <Modal 
          isOpen={!!feedback} 
          onClose={() => setFeedback(null)} 
          title={feedback.type === 'success' ? 'Success' : 'Error'}
        >
          <div className="space-y-4">
            <p className={feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}>
              {feedback.message}
            </p>
            <button
              onClick={() => setFeedback(null)}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Password Reset Confirmation */}
      <ConfirmModal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={handleResetPassword}
        title="Reset Password"
        isLoading={loading}
      >
        Are you sure you want to send a password reset email to <strong>{resetTarget}</strong>?
      </ConfirmModal>

      {/* Delete User Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Delete User"
        type="danger"
        isLoading={isDeleting}
      >
        Are you sure you want to delete this user profile? This action cannot be undone.
      </ConfirmModal>

      {/* Direct Password Change Modal */}
      {changePasswordTarget && (
        <Modal
          isOpen={!!changePasswordTarget}
          onClose={() => {
            setChangePasswordTarget(null);
            setNewPassword('');
          }}
          title="Change Password Directly"
        >
          <form onSubmit={handleChangePasswordDirectly} className="space-y-4">
            <p className="text-sm text-gray-500">
              Set a new password for <strong>{changePasswordTarget.email}</strong>. 
              This will update their account immediately without requiring an email.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full p-2 border border-gray-200 rounded-lg"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setChangePasswordTarget(null)}
                className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isChangingPassword || newPassword.length < 6}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {isChangingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Purge Database Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={32} />
              <h2 className="text-xl font-bold">Purge Database</h2>
            </div>
            <p className="text-gray-600 mb-6">
              This action will permanently delete all transactions, products, expenses, payments, and other records. 
              Users will remain. This cannot be undone.
            </p>
            <form onSubmit={handlePurgeDatabase} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  placeholder="Enter your password to confirm"
                  className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  value={purgePassword}
                  onChange={e => setPurgePassword(e.target.value)}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPurgeModal(false);
                    setPurgePassword('');
                  }}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={purgeLoading}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {purgeLoading ? 'Purging...' : 'Confirm Purge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
