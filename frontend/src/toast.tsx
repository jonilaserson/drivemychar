import React from 'react';

type Toast = { id: number; text: string; x?: number; y?: number };

type ToastAPI = {
  show: (text: string) => void;
  showNear: (text: string, anchorEl: HTMLElement) => void;
};

const ToastContext = React.createContext<ToastAPI>({ show: () => {}, showNear: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => remove(id), 1500);
  }, [remove]);

  const showNear = React.useCallback((text: string, anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const id = nextId.current++;
    const x = Math.round(rect.right + 8);
    const y = Math.round(rect.top + rect.height / 2);
    setToasts((prev) => [...prev, { id, text, x, y }]);
    window.setTimeout(() => remove(id), 1500);
  }, [remove]);

  React.useEffect(() => {
    (window as any).__toast = show; // legacy hook if needed
  }, [show]);

  return (
    <ToastContext.Provider value={{ show, showNear }}>
      {children}
      {/* Global stack (bottom-right) for non-anchored toasts */}
      <div style={{ position: 'fixed', bottom: 16, right: 16, display: 'grid', gap: 8, zIndex: 9999 }}>
        {toasts.filter((t) => t.x == null).map((t) => (
          <div key={`g-${t.id}`} className="surface" style={{ padding: '8px 12px' }}>{t.text}</div>
        ))}
      </div>
      {/* Anchored toasts rendered at fixed coordinates computed at trigger time */}
      {toasts.filter((t) => t.x != null && t.y != null).map((t) => (
        <div key={`a-${t.id}`} className="surface toast-inline" style={{ position: 'fixed', left: t.x, top: t.y, zIndex: 9999 }}>
          {t.text}
        </div>
      ))}
    </ToastContext.Provider>
  );
}


