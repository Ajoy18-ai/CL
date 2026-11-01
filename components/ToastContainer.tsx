import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { Toast, useToastStore } from '../store/useToastStore';

interface ToastItemProps {
  toast: Toast;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast }) => {
  const removeToast = useToastStore((state) => state.removeToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(toast.duration || 4000);
  const [isHovered, setIsHovered] = useState(false);

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      removeToast(toast.id);
    }, remainingRef.current);
  };

  const pauseTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      remainingRef.current -= Date.now() - startTimeRef.current;
    }
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id]);

  useEffect(() => {
    if (isHovered) {
      pauseTimer();
    } else {
      if (remainingRef.current > 0) {
        startTimer();
      }
    }
  }, [isHovered]);

  const config = {
    success: {
      bg: 'bg-zinc-950/95 border-emerald-500/20 text-emerald-400 shadow-emerald-950/20',
      icon: <CheckCircle2 size={16} className="text-emerald-500" />,
      label: 'Success',
    },
    error: {
      bg: 'bg-zinc-950/95 border-red-500/20 text-red-400 shadow-red-950/20',
      icon: <AlertCircle size={16} className="text-red-500" />,
      label: 'Error',
    },
    warning: {
      bg: 'bg-zinc-950/95 border-amber-500/20 text-amber-400 shadow-amber-950/20',
      icon: <AlertTriangle size={16} className="text-amber-500" />,
      label: 'Warning',
    },
    info: {
      bg: 'bg-zinc-950/95 border-blue-500/20 text-blue-400 shadow-blue-950/20',
      icon: <Info size={16} className="text-blue-500" />,
      label: 'Information',
    },
  }[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="status"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl border md:backdrop-blur-xl bg-zinc-950/95 shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6)] w-full max-w-[360px] pointer-events-auto transition-all ${config.bg}`}
    >
      <div className="shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5 leading-none">{config.label}</p>
        <p className="text-xs font-bold leading-snug text-zinc-200">{toast.message}</p>
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-1 rounded-lg text-zinc-500 hover:text-white transition-colors hover:bg-white/5 shrink-0"
        aria-label={`Dismiss ${config.label}`}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      className="fixed bottom-24 sm:bottom-28 md:bottom-10 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-10 z-[3500] flex flex-col gap-3 px-4 w-full max-w-[392px] items-center md:items-end pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
};
