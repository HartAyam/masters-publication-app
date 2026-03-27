import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div 
        className={cn(
          "bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col",
          className
        )}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps extends ModalProps {
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'primary';
  isLoading?: boolean;
}

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  children, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  type = 'primary',
  isLoading = false
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-gray-600">
          {children}
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50",
              type === 'danger' ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
