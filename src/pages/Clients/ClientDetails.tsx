import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { Customer, Transaction, Payment, ClientType } from '@/types';
import { 
  ArrowLeft, User, Building, Phone, Mail, MapPin, DollarSign, Clock, 
  CreditCard, Trash2, Edit2, X, FileSpreadsheet, FileText, Search, 
  RotateCcw, Calendar, CheckCircle2, ChevronRight, AlertCircle, ShoppingCart
} from 'lucide-react';
import { formatCurrency } from '@/lib/idUtils';
import { useBranches } from '@/hooks/useBranches';
import { isGlobalUser } from '@/lib/utils';
import { exportToExcel } from '@/lib/exportUtils';
import Pagination from '@/components/common/Pagination';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  startOfMonth, 
  startOfYear, 
  subDays 
} from 'date-fns';

export interface ClientHistoryItem {
  id: string;
  itemType: 'transaction' | 'payment';
  dateObj: Date;
  dateRaw: any;
  type: string;
  reference: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  paymentMethod?: string;
  isAdjusted?: boolean;
  isBackup?: boolean;
  notes?: string;
  raw: Transaction | Payment;
}

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { branches: dbBranches } = useBranches();
  const [client, setClient] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterPreset, setDateFilterPreset] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [showBackups, setShowBackups] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ClientType>('Individual');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [primaryBranch, setPrimaryBranch] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('');

  // Contact Person State
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');

  const openEditModal = () => {
    if (!client) return;
    setName(client.name);
    setType(client.type);
    setPhone(client.phone);
    setEmail(client.email || '');
    setAddress(client.address || '');
    setPrimaryBranch(client.primaryBranch);
    setOpeningBalance(client.openingBalance !== undefined ? client.openingBalance.toString() : '');
    if (client.contactPerson) {
      setContactName(client.contactPerson.name);
      setContactPhone(client.contactPerson.phone);
      setContactEmail(client.contactPerson.email || '');
      setContactRole(client.contactPerson.role || '');
    } else {
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setContactRole('');
    }
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !userProfile) return;
    setLoading(true);

    try {
      const clientData: any = {
        name,
        type,
        phone,
        email,
        address,
        primaryBranch: isGlobalUser(userProfile.role) ? primaryBranch : userProfile.branchId || client.primaryBranch,
        openingBalance: parseFloat(openingBalance) || 0,
      };

      if (type === 'Organization') {
        clientData.contactPerson = {
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          role: contactRole
        };
      }

      const prevOpeningBalance = client.openingBalance || 0;
      const newOpeningBalance = parseFloat(openingBalance) || 0;
      const debtDiff = newOpeningBalance - prevOpeningBalance;
      clientData.totalDebt = (client.totalDebt || 0) + debtDiff;

      await updateDoc(doc(db, 'customers', client.id), clientData);
      
      setClient({
        ...client,
        ...clientData,
      });

      alert('Client updated successfully');
      setShowEditModal(false);
    } catch (error) {
      console.error("Error updating client:", error);
      alert('Failed to update client');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id || !userProfile) return;

    const fetchClientData = async () => {
      try {
        setError(null);
        setLoading(true);

        // Fetch Client Document
        const clientDoc = await getDoc(doc(db, 'customers', id));
        if (clientDoc.exists()) {
          setClient({ id: clientDoc.id, ...clientDoc.data() } as Customer);
        } else {
          setError("Client not found");
          setLoading(false);
          return;
        }

        // Fetch Transactions for this customer
        const txQuery = query(
          collection(db, 'transactions'),
          where('customerId', '==', id)
        );
        const txSnapshot = await getDocs(txQuery);
        const transData = txSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(transData);

        // Fetch Payments for this customer
        const paymentsQuery = query(
          collection(db, 'payments'),
          where('customerId', '==', id)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsData = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        setPayments(paymentsData);
      } catch (error: any) {
        console.error("Error fetching client details:", error);
        setError("Failed to load client details and transaction history.");
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [id, userProfile]);

  // Combine and unify transactions and payments into a single history stream
  const unifiedHistory = useMemo((): ClientHistoryItem[] => {
    const parseDate = (d: any): Date => {
      if (!d) return new Date(0);
      if (typeof d.toDate === 'function') return d.toDate();
      if (d.seconds) return new Date(d.seconds * 1000);
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    };

    const txItems: ClientHistoryItem[] = transactions.map(tx => {
      const dateObj = parseDate(tx.date);
      const itemsSummary = tx.items && tx.items.length > 0 
        ? `${tx.items.length} items (${tx.items.map(i => `${i.productName} x${i.quantity}`).join(', ')})`
        : (tx.notes || 'Order');

      return {
        id: tx.id,
        itemType: 'transaction',
        dateObj,
        dateRaw: tx.date,
        type: tx.type || 'Order',
        reference: tx.id,
        description: itemsSummary,
        totalAmount: Number(tx.totalAmount) || 0,
        amountPaid: Number(tx.amountPaid) || 0,
        balanceDue: Number(tx.balanceDue) || 0,
        status: tx.status || 'Completed',
        paymentMethod: tx.paymentMethod,
        isAdjusted: !!tx.isAdjusted,
        isBackup: !!tx.isBackup,
        notes: tx.notes,
        raw: tx
      };
    });

    const paymentItems: ClientHistoryItem[] = payments.map(p => {
      const dateObj = parseDate(p.date);
      const paymentAmount = Number(p.amount) || 0;
      const desc = p.reference 
        ? `Payment Received (Ref: ${p.reference})`
        : (p.notes || `Payment via ${p.paymentMethod || 'Cash'}`);

      return {
        id: p.id,
        itemType: 'payment',
        dateObj,
        dateRaw: p.date,
        type: 'Payment',
        reference: p.reference || p.id,
        description: desc,
        totalAmount: paymentAmount,
        amountPaid: paymentAmount,
        balanceDue: 0,
        status: 'Completed',
        paymentMethod: p.paymentMethod || 'Cash',
        isAdjusted: false,
        isBackup: false,
        notes: p.notes,
        raw: p
      };
    });

    // Merge and sort descending (newest first)
    return [...txItems, ...paymentItems].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [transactions, payments]);

  // Apply filters
  const filteredHistory = useMemo(() => {
    return unifiedHistory.filter(item => {
      // Archived Originals filter
      if (!showBackups && item.isBackup) {
        return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const queryLower = searchTerm.toLowerCase();
        const matchesRef = item.reference.toLowerCase().includes(queryLower);
        const matchesDesc = item.description.toLowerCase().includes(queryLower);
        const matchesType = item.type.toLowerCase().includes(queryLower);
        const matchesMethod = (item.paymentMethod || '').toLowerCase().includes(queryLower);
        const matchesNotes = (item.notes || '').toLowerCase().includes(queryLower);
        if (!matchesRef && !matchesDesc && !matchesType && !matchesMethod && !matchesNotes) {
          return false;
        }
      }

      // Transaction Type filter
      if (selectedType !== 'ALL') {
        if (selectedType === 'Orders') {
          if (item.itemType !== 'transaction') return false;
        } else if (selectedType === 'Payment') {
          if (item.itemType !== 'payment' && item.type !== 'Payment') return false;
        } else if (item.type !== selectedType) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'Adjusted') {
          if (!item.isAdjusted && item.status !== 'Adjusted') return false;
        } else if (selectedStatus === 'Original (Archived)') {
          if (!item.isBackup && item.status !== 'Original (Archived)') return false;
        } else if (item.status !== selectedStatus) {
          return false;
        }
      }

      // Date Range filter
      if (dateFilterPreset !== 'ALL') {
        const itemDate = item.dateObj;
        if (dateFilterPreset === 'TODAY') {
          const today = startOfDay(new Date());
          if (itemDate < today) return false;
        } else if (dateFilterPreset === 'THIS_WEEK') {
          const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
          if (itemDate < weekStart) return false;
        } else if (dateFilterPreset === 'THIS_MONTH') {
          const monthStart = startOfMonth(new Date());
          if (itemDate < monthStart) return false;
        } else if (dateFilterPreset === 'LAST_30_DAYS') {
          const thirtyDaysAgo = subDays(new Date(), 30);
          if (itemDate < thirtyDaysAgo) return false;
        } else if (dateFilterPreset === 'THIS_YEAR') {
          const yearStart = startOfYear(new Date());
          if (itemDate < yearStart) return false;
        } else if (dateFilterPreset === 'CUSTOM') {
          if (customStartDate) {
            const start = startOfDay(new Date(customStartDate));
            if (itemDate < start) return false;
          }
          if (customEndDate) {
            const end = endOfDay(new Date(customEndDate));
            if (itemDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [unifiedHistory, showBackups, searchTerm, selectedType, selectedStatus, dateFilterPreset, customStartDate, customEndDate]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedStatus, dateFilterPreset, customStartDate, customEndDate, showBackups, itemsPerPage]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedHistory = filteredHistory.slice(
    (validCurrentPage - 1) * itemsPerPage,
    validCurrentPage * itemsPerPage
  );

  // Active filter count
  const isFiltered = searchTerm !== '' || selectedType !== 'ALL' || selectedStatus !== 'ALL' || dateFilterPreset !== 'ALL' || showBackups;

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedType('ALL');
    setSelectedStatus('ALL');
    setDateFilterPreset('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setShowBackups(false);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!client) return;
    if (filteredHistory.length === 0) {
      alert('No records available to export with current filters.');
      return;
    }

    const dataToExport = filteredHistory.map(item => {
      const isPay = item.itemType === 'payment';
      const isArchived = item.isBackup;

      return {
        'Date': format(item.dateObj, 'yyyy-MM-dd HH:mm'),
        'Type': isArchived ? `${item.type} (Original Archived)` : (item.isAdjusted ? `${item.type} (Adjusted)` : item.type),
        'Reference #': item.reference,
        'Description / Items': item.description,
        'Total Amount (GH₵)': item.totalAmount,
        'Amount Paid (GH₵)': item.amountPaid,
        'Balance Due (GH₵)': isArchived ? 'Ref Only' : (isPay ? 0 : item.balanceDue),
        'Status': isArchived ? 'Original (Archived)' : item.status,
        'Payment Method': item.paymentMethod || 'N/A',
        'Notes': item.notes || ''
      };
    });

    const safeClientName = client.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeClientName}_Transaction_History_${format(new Date(), 'yyyy-MM-dd')}`;
    exportToExcel(dataToExport, fileName, 'Client Ledger');
  };

  // Export to PDF (.pdf)
  const handleExportPDF = () => {
    if (!client) return;
    if (filteredHistory.length === 0) {
      alert('No records available to export with current filters.');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const branchName = dbBranches.find(b => b.id === client.primaryBranch || b.name === client.primaryBranch)?.name || client.primaryBranch;

    // Header Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('MASTERS PUBLICATIONS', 14, 18);

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('CUSTOMER STATEMENT & TRANSACTION LEDGER', 14, 25);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, 14, 31);

    // Summary Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 35, pageWidth - 28, 28, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Client: ${client.name}`, 18, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Type: ${client.type}   |   Phone: ${client.phone || 'N/A'}   |   Branch: ${branchName}`, 18, 48);
    doc.text(`Address: ${client.address || 'N/A'}   |   Email: ${client.email || 'N/A'}`, 18, 54);

    // Debt info in summary box
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    if (client.totalDebt > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`Outstanding Debt: ${formatCurrency(client.totalDebt)}`, pageWidth - 18, 45, { align: 'right' });
    } else {
      doc.setTextColor(22, 163, 74);
      doc.text(`Account Status: Clear (${formatCurrency(client.totalDebt)})`, pageWidth - 18, 45, { align: 'right' });
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Opening Balance: ${formatCurrency(client.openingBalance || 0)}`, pageWidth - 18, 52, { align: 'right' });

    // Table Data
    const tableRows = filteredHistory.map(item => {
      const isPay = item.itemType === 'payment';
      const isArchived = item.isBackup;
      const typeLabel = isArchived 
        ? `${item.type} (Archived)` 
        : (item.isAdjusted ? `${item.type} (Adj)` : item.type);

      const desc = item.description.length > 32 ? item.description.substring(0, 30) + '...' : item.description;

      return [
        format(item.dateObj, 'dd/MM/yyyy'),
        typeLabel,
        item.reference,
        desc,
        isPay ? '-' : formatCurrency(item.totalAmount),
        item.amountPaid > 0 ? (isPay ? `+${formatCurrency(item.amountPaid)}` : formatCurrency(item.amountPaid)) : '-',
        isArchived ? 'Ref Only' : (isPay ? '-' : formatCurrency(item.balanceDue)),
        isArchived ? 'Archived' : item.status
      ];
    });

    autoTable(doc, {
      startY: 68,
      head: [['Date', 'Type', 'Ref #', 'Description / Items', 'Total', 'Paid', 'Balance', 'Status']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 26 },
        2: { cellWidth: 24 },
        3: { cellWidth: 44 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'center', cellWidth: 18 },
      },
      didDrawPage: (data) => {
        const pageCount = (doc.internal as any).getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(150);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount} — Masters Publications Client Ledger`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      }
    });

    const safeClientName = client.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`${safeClientName}_Statement_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this client? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'customers', id!));
      alert('Client deleted successfully');
      navigate('/clients');
    } catch (error) {
      console.error("Error deleting client:", error);
      alert('Failed to delete client');
    }
  };

  if (loading && !client) return <div className="p-12 text-center text-gray-500">Loading client records...</div>;
  if (error) return <div className="p-8 text-center text-red-600 bg-red-50 rounded-xl max-w-xl mx-auto">{error}</div>;
  if (!client) return <div className="p-8 text-center text-gray-500">Client not found</div>;

  // Aggregate totals
  const totalOrdersAmount = transactions
    .filter(t => !t.isBackup)
    .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
  const totalPaymentsAmount = payments
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <button 
        onClick={() => navigate(-1)} 
        className="inline-flex items-center text-gray-500 hover:text-gray-900 transition-colors font-medium text-sm"
      >
        <ArrowLeft size={18} className="mr-2" />
        Back to Clients
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl ${client.type === 'Organization' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {client.type === 'Organization' ? <Building size={32} /> : <User size={32} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 flex-wrap">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs uppercase font-medium text-gray-700">{client.type}</span>
                <span>•</span>
                <span>{dbBranches.find(b => b.id === client.primaryBranch || b.branchId === client.primaryBranch || b.name === client.primaryBranch)?.name || client.primaryBranch} Branch</span>
                <span>•</span>
                <span className="text-xs text-gray-400">ID: {client.id}</span>
              </div>
            </div>
          </div>
          
          <div className="text-right space-y-3 w-full md:w-auto">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Outstanding Debt</p>
              <p className={`text-3xl font-bold ${client.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(client.totalDebt)}
              </p>
            </div>
            {userProfile?.role !== 'Supervisor' && (
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={openEditModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-xs font-medium"
                >
                  <Edit2 size={15} />
                  Edit Client
                </button>
                {client.totalDebt > 0 && (
                  <button 
                    onClick={() => navigate('/payments', { state: { customerId: client.id } })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-xs font-semibold"
                  >
                    <CreditCard size={15} />
                    Record Payment
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors shadow-sm text-xs font-medium"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-3 text-gray-600">
            <Phone size={18} className="text-gray-400 shrink-0" />
            <a href={`tel:${client.phone}`} className="hover:text-blue-600 hover:underline">{client.phone || 'No phone'}</a>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Mail size={18} className="text-gray-400 shrink-0" />
            {client.email ? (
              <a href={`mailto:${client.email}`} className="hover:text-blue-600 hover:underline truncate">{client.email}</a>
            ) : (
              <span className="text-gray-400">No email provided</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <MapPin size={18} className="text-gray-400 shrink-0" />
            <span className="truncate">{client.address || 'No address provided'}</span>
          </div>
        </div>

        {/* Contact Person Details */}
        {client.type === 'Organization' && client.contactPerson && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Contact Person</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2.5 text-gray-700">
                <User size={16} className="text-gray-400 shrink-0" />
                <div>
                  <span className="font-medium text-gray-900">{client.contactPerson.name}</span>
                  {client.contactPerson.role && <span className="text-xs text-gray-500 ml-2">({client.contactPerson.role})</span>}
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-gray-600">
                <Phone size={16} className="text-gray-400 shrink-0" />
                <a href={`tel:${client.contactPerson.phone}`} className="hover:text-blue-600 hover:underline">
                  {client.contactPerson.phone}
                </a>
              </div>
              {client.contactPerson.email && (
                <div className="flex items-center gap-2.5 text-gray-600">
                  <Mail size={16} className="text-gray-400 shrink-0" />
                  <a href={`mailto:${client.contactPerson.email}`} className="hover:text-blue-600 hover:underline truncate">
                    {client.contactPerson.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Opening Balance</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(client.openingBalance || 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Initial customer debt</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Total Invoiced</p>
          <p className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(totalOrdersAmount)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{transactions.filter(t => !t.isBackup).length} active orders</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Payments Received</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(totalPaymentsAmount)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{payments.length} payment receipts</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Current Balance</p>
          <p className={`text-lg font-bold mt-1 ${client.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(client.totalDebt)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Net outstanding debt</p>
        </div>
      </div>

      {/* Transaction & Payment History Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Section Header & Export Buttons */}
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Transaction & Payment History</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                {filteredHistory.length} records
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Comprehensive ledger including invoices, sales, and payments received
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Buttons */}
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-colors shadow-sm"
              title="Export to Excel Spreadsheet (.xlsx)"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 text-xs font-semibold transition-colors shadow-sm"
              title="Export to PDF Document"
            >
              <FileText size={15} className="text-rose-600" />
              <span>Export PDF</span>
            </button>

            {/* Toggle Archived Originals */}
            <button 
              type="button"
              onClick={() => setShowBackups(!showBackups)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                showBackups 
                  ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-sm' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {showBackups ? 'Hide Archived Originals' : 'Show Archived Originals'}
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-gray-50/70 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search ref #, items, notes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date Preset Filter */}
            <div>
              <select
                value={dateFilterPreset}
                onChange={e => setDateFilterPreset(e.target.value as any)}
                className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Date: All Time</option>
                <option value="TODAY">Date: Today</option>
                <option value="THIS_WEEK">Date: This Week</option>
                <option value="THIS_MONTH">Date: This Month</option>
                <option value="LAST_30_DAYS">Date: Last 30 Days</option>
                <option value="THIS_YEAR">Date: This Year</option>
                <option value="CUSTOM">Date: Custom Range...</option>
              </select>
            </div>

            {/* Transaction Type Filter */}
            <div>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Type: All Types</option>
                <option value="Orders">All Orders</option>
                <option value="Credit Sale">Credit Sale</option>
                <option value="Cash Sale">Cash Sale</option>
                <option value="Payment">Payments Received</option>
                <option value="Stock Return">Stock Return</option>
                <option value="Deposit">Deposit</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full py-2 px-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Status: All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="Pending Payment">Pending Payment</option>
                <option value="Returned">Returned</option>
                <option value="Adjusted">Adjusted</option>
                <option value="Original (Archived)">Original (Archived)</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Row */}
          {dateFilterPreset === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200/60 text-xs">
              <span className="text-gray-600 font-medium">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="p-1.5 bg-white border border-gray-200 rounded text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-gray-600 font-medium">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="p-1.5 bg-white border border-gray-200 rounded text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Active Filter Indicators & Reset */}
          {isFiltered && (
            <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
              <span>Showing {filteredHistory.length} of {unifiedHistory.length} total records</span>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                <RotateCcw size={13} />
                Reset all filters
              </button>
            </div>
          )}
        </div>
        
        {/* Table of Transactions & Payments */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Type</th>
                <th className="p-4">Ref #</th>
                <th className="p-4">Description / Details</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-right">Paid</th>
                <th className="p-4 text-right">Balance</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-500">
                    <p className="font-medium text-gray-700">No records found matching the selected filters.</p>
                    {isFiltered && (
                      <button
                        onClick={resetFilters}
                        className="mt-2 text-xs text-blue-600 hover:underline font-semibold"
                      >
                        Reset filters to view all records
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((item) => {
                  const isPay = item.itemType === 'payment';
                  const isArchived = item.isBackup;
                  
                  return (
                    <tr 
                      key={`${item.itemType}-${item.id}`} 
                      className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${
                        isArchived ? 'bg-amber-50/30' : isPay ? 'bg-emerald-50/15' : ''
                      }`}
                      onClick={() => {
                        if (isPay) {
                          navigate(`/payments/${item.id}`);
                        } else {
                          navigate(`/orders/${item.id}`);
                        }
                      }}
                    >
                      {/* Date */}
                      <td className="p-4 whitespace-nowrap text-xs text-gray-600">
                        <div className="font-medium text-gray-900">
                          {format(item.dateObj, 'dd MMM yyyy')}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {format(item.dateObj, 'h:mm a')}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="p-4 whitespace-nowrap">
                        {isPay ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CreditCard size={13} />
                            <span>Payment</span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-medium text-gray-900 text-xs">
                              {item.type}
                            </span>
                            {isArchived ? (
                              <span className="block text-[10px] text-amber-700 font-bold uppercase tracking-wider mt-0.5">
                                Original (Archived)
                              </span>
                            ) : item.isAdjusted ? (
                              <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                                Adjusted Order
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* Reference # */}
                      <td className="p-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                          {item.reference}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="p-4 text-xs text-gray-600 max-w-xs">
                        <div className="truncate font-medium text-gray-800">
                          {item.description}
                        </div>
                        {item.paymentMethod && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Method: {item.paymentMethod}
                          </div>
                        )}
                      </td>

                      {/* Total */}
                      <td className="p-4 whitespace-nowrap text-right font-medium text-xs text-gray-900">
                        {isPay ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          formatCurrency(item.totalAmount)
                        )}
                      </td>

                      {/* Paid */}
                      <td className="p-4 whitespace-nowrap text-right text-xs">
                        {isPay ? (
                          <span className="text-emerald-600 font-bold">
                            +{formatCurrency(item.amountPaid)}
                          </span>
                        ) : item.amountPaid > 0 ? (
                          <span className="text-gray-900 font-medium">
                            {formatCurrency(item.amountPaid)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* Balance Due */}
                      <td className="p-4 whitespace-nowrap text-right text-xs font-semibold">
                        {isArchived ? (
                          <span className="text-amber-700 italic font-medium text-xs">Ref Only</span>
                        ) : isPay ? (
                          <span className="text-gray-400 text-xs">-</span>
                        ) : item.balanceDue > 0 ? (
                          <span className="text-red-600">{formatCurrency(item.balanceDue)}</span>
                        ) : (
                          <span className="text-gray-400">GH₵0.00</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="p-4 whitespace-nowrap text-center">
                        {isArchived ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Original (Archived)
                          </span>
                        ) : isPay ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            Completed
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            item.status === 'Completed' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : item.status === 'Pending Payment' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </td>

                      {/* Chevron Arrow */}
                      <td className="p-4 text-right text-gray-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        <Pagination
          currentPage={validCurrentPage}
          totalPages={totalPages}
          totalItems={filteredHistory.length}
          itemsPerPage={itemsPerPage}
          itemName="records"
          pageSizeOptions={[10, 20, 50, 100]}
          onItemsPerPageChange={(newSize) => {
            setItemsPerPage(newSize);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Edit Client Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar text-left">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Client</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={type}
                    onChange={e => setType(e.target.value as ClientType)}
                  >
                    <option value="Individual">Individual</option>
                    <option value="Organization">Organization</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address (Optional)</label>
                <textarea
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {type === 'Organization' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Contact Person Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        required={type === 'Organization'}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                        value={contactName}
                        onChange={e => setContactName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="text"
                          required={type === 'Organization'}
                          className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <input
                          type="text"
                          className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                          value={contactRole}
                          onChange={e => setContactRole(e.target.value)}
                          placeholder="e.g. Manager"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                      <input
                        type="email"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                        value={contactEmail}
                        onChange={e => setContactEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {isGlobalUser(userProfile?.role || '') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Branch</label>
                  <select
                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    value={primaryBranch}
                    onChange={e => setPrimaryBranch(e.target.value)}
                  >
                    {dbBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
