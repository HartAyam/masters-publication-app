import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, startAfter, getDocs, where, Timestamp } from 'firebase/firestore';
import { ActivityLog, Role } from '@/types';
import { Search, Eye, X, Download, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { exportToCSV, printDiv } from '@/lib/exportUtils';

const PAGE_SIZE = 20;

export default function AuditLogsList() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [firstVisible, setFirstVisible] = useState<any>(null); // For simplified prev/next if needed, but Firestore pagination is tricky.
  // Implementing simple "Next" pagination for now as "Previous" is harder with Firestore without keeping history.
  const [page, setPage] = useState(1);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedRole, setSelectedRole] = useState<Role | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Modal
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    fetchLogs(true);
  }, [selectedAction, selectedRole, dateFilter]); // Reset pagination on filter change

  const fetchLogs = async (isReset = false) => {
    setLoading(true);
    console.log("[AuditLogs] Fetching logs...");
    try {
      // Simplified query to avoid composite index requirements
      // We'll do filtering client-side for better reliability without manual index management
      let q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'));

      if (!isReset && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      // Fetch a bit more if filters are active to ensure we have something to show
      const fetchLimit = (selectedAction !== 'ALL' || selectedRole !== 'ALL') ? PAGE_SIZE * 3 : PAGE_SIZE;
      q = query(q, limit(fetchLimit));

      const snapshot = await getDocs(q);
      console.log(`[AuditLogs] Found ${snapshot.docs.length} logs`);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));

      if (isReset) {
        setLogs(data);
      } else {
        setLogs(prev => [...prev, ...data]);
      }
      
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    } catch (error) {
      console.error("[AuditLogs] Error fetching logs:", error);
      // Fallback to even simpler query if orderBy fails
      if (isReset) {
        try {
          console.log("[AuditLogs] Retrying with simplest query...");
          const simpleQ = query(collection(db, 'activity_logs'), limit(PAGE_SIZE));
          const simpleSnapshot = await getDocs(simpleQ);
          const simpleData = simpleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
          setLogs(simpleData);
        } catch (innerError) {
          console.error("[AuditLogs] Simple query also failed:", innerError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Client-side search for simplicity on the current page, or we'd need a dedicated search service (Algolia/Typesense)
    // Given Firestore limitations, strict text search is hard.
    // We'll filter the *displayed* logs for now if the user types something.
  };

  const filteredLogs = logs.filter(log => {
    // Role filter
    if (selectedRole !== 'ALL' && log.userRole !== selectedRole) return false;
    
    // Action filter
    if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      log.details.toLowerCase().includes(term) ||
      log.userId.toLowerCase().includes(term)
    );
  });

  const handleExport = () => {
    const dataToExport = filteredLogs.map(l => ({
      Timestamp: l.timestamp?.toDate ? format(l.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A',
      User: l.userId,
      Role: l.userRole,
      Action: l.action,
      Details: l.details,
      Branch: l.branchId
    }));
    exportToCSV(dataToExport, `AuditLogs_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500">Track all system activities and changes</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => printDiv('audit-table', 'Audit Logs Report')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <select
              className="w-full p-2 border border-gray-200 rounded-lg"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role | 'ALL')}
            >
              <option value="ALL">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Cashier">Cashier</option>
              <option value="Accountant">Accountant</option>
              <option value="Director">Director</option>
            </select>
          </div>
          {/* Add more filters as needed */}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" id="audit-table">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 font-medium text-gray-600">Timestamp</th>
              <th className="p-4 font-medium text-gray-600">Action</th>
              <th className="p-4 font-medium text-gray-600">Name</th>
              <th className="p-4 font-medium text-gray-600">Role</th>
              <th className="p-4 font-medium text-gray-600">Branch</th>
              <th className="p-4 font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredLogs.map((log) => (
              <tr 
                key={log.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedLog(log)}
              >
                <td className="p-4 text-gray-500">
                  {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'PP pp') : 'N/A'}
                </td>
                <td className="p-4 font-medium text-gray-900">{log.action}</td>
                <td className="p-4 text-gray-500">{log.userName || log.userId}</td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium">
                    {log.userRole}
                  </span>
                </td>
                <td className="p-4 text-gray-500">{log.branchId}</td>
                <td className="p-4 text-gray-400">
                  <Eye size={16} />
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">No logs found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        
        {/* Load More */}
        {lastVisible && (
          <div className="p-4 border-t border-gray-100 flex justify-center">
            <button
              onClick={() => fetchLogs(false)}
              disabled={loading}
              className="text-blue-600 hover:underline disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Log Details</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">Timestamp</div>
                  <div className="font-medium">{selectedLog.timestamp?.toDate ? format(selectedLog.timestamp.toDate(), 'PP pp') : 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Action</div>
                  <div className="font-medium">{selectedLog.action}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">User Name</div>
                  <div className="font-medium">{selectedLog.userName || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">User ID</div>
                  <div className="font-medium">{selectedLog.userId}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Role</div>
                  <div className="font-medium">{selectedLog.userRole}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Branch</div>
                  <div className="font-medium">{selectedLog.branchId}</div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 mb-1 text-sm">Details</div>
                <div className="bg-gray-50 p-3 rounded-lg text-sm font-mono whitespace-pre-wrap">
                  {selectedLog.details}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
