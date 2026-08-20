import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable client-side pagination. Restricts any list to `pageSize` items with
 * Prev/Next controls. Hook must be called unconditionally at a component's top
 * level (one call per list).
 */
export function usePaged<T>(items: T[], pageSize = 5) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(page, totalPages - 1);
  const start = clamped * pageSize;
  return {
    page: clamped,
    setPage,
    totalPages,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
  };
}

export const Pager: React.FC<{
  page: number;
  totalPages: number;
  total?: number;
  setPage: (p: number) => void;
  label?: string;
}> = ({ page, totalPages, total, setPage, label }) => {
  if (totalPages <= 1) return null;
  const btn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: 600,
    color: disabled ? '#c4c4c8' : '#09090b',
    background: '#ffffff',
    border: '1px solid #e4e4e7',
    borderRadius: '7px',
    padding: '5px 10px',
    cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '12px' }}>
      <span style={{ fontSize: '11px', color: '#a1a1aa' }}>
        {total != null ? `${total} ${label || 'items'} · ` : ''}Page {page + 1} of {totalPages}
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button style={btn(page === 0)} disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft size={13} /> Prev
        </button>
        <button style={btn(page >= totalPages - 1)} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};
