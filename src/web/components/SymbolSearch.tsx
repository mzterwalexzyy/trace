import React, { useState, useEffect, useRef } from 'react';
import { Search, Code2, Globe, Database, FileText, ChevronRight } from 'lucide-react';
import { GraphNode } from '../../core/hydradb/types.js';

interface SymbolSearchProps {
  onSelectSymbol: (symbolNode: GraphNode) => void;
}

export const SymbolSearch: React.FC<SymbolSearchProps> = ({ onSelectSymbol }) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/symbols?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data.symbols || []);
          setIsOpen(true);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Search error:', err);
          setIsLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'APIEndpoint':
        return <Globe size={14} style={{ color: '#0a0a0a' }} />;
      case 'DBSchema':
        return <Database size={14} style={{ color: '#059669' }} />;
      case 'File':
        return <FileText size={14} style={{ color: '#71717a' }} />;
      default:
        return <Code2 size={14} style={{ color: '#71717a' }} />;
    }
  };

  return (
    <div ref={searchRef} style={{ position: 'relative', width: '280px' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder="Search symbols (e.g. calculateTax)..."
          style={{
            width: '100%',
            padding: '6px 10px 6px 32px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: '#0a0a0a',
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '6px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          maxHeight: '360px',
          overflowY: 'auto',
          zIndex: 500,
        }}>
          {isLoading ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Searching graph...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No matching symbols found.
            </div>
          ) : (
            results.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectSymbol(item.node);
                  setIsOpen(false);
                  setQuery('');
                }}
                style={{
                  padding: '10px 12px',
                  borderBottom: idx < results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {getNodeIcon(item.node.type)}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0a0a0a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item.node.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {item.node.filePath || 'internal'} • {item.node.type}
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
