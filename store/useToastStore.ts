import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

export const useToastStore = create<ToastState>((set) => {
  const removeToast = (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  };

  const addToast = (message: string, type: Toast['type'], duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    // Sensible duration defaults: errors persist longer (8000ms), others are shorter (4000ms)
    const defaultDuration = type === 'error' ? 8000 : 4000;
    const finalDuration = duration !== undefined ? duration : defaultDuration;

    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration: finalDuration }],
    }));
  };

  return {
    toasts: [],
    addToast,
    removeToast,
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
  };
});
