import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getDataModeStatus, subscribeDataMode } from '@/api/base44Client';

const DataModeContext = createContext(getDataModeStatus());

export function DataModeProvider({ children }) {
  const [status, setStatus] = useState(() => getDataModeStatus());

  useEffect(() => subscribeDataMode((nextStatus) => setStatus({ ...nextStatus })), []);

  const value = useMemo(() => status, [status]);
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode() {
  return useContext(DataModeContext);
}

export function DataModeIndicator() {
  const status = useDataMode();
  const palette = status.mode === 'supabase'
    ? { background: '#dcfce7', border: '#86efac', color: '#166534', dot: '#16a34a' }
    : status.mode === 'local'
      ? { background: '#fff7ed', border: '#fdba74', color: '#9a3412', dot: '#f97316' }
      : { background: '#fef2f2', border: '#fca5a5', color: '#991b1b', dot: '#dc2626' };

  return (
    <div
      role="status"
      aria-live="polite"
      data-data-mode={status.mode}
      title={status.error || status.message}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        maxWidth: 'min(420px, calc(100vw - 24px))',
        padding: '7px 10px',
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        background: palette.background,
        color: palette.color,
        boxShadow: '0 4px 14px rgba(15, 23, 42, .14)',
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, flex: '0 0 8px', borderRadius: '50%', background: palette.dot }} />
      <span>{status.message}</span>
    </div>
  );
}
