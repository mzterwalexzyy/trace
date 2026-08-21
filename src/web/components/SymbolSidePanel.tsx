import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Code2,
  ShieldAlert,
  ArrowRight,
  Pin,
  PinOff,
  Boxes,
  Globe,
  FileCode,
  Database,
  Layers,
  Server,
  Copy,
  Crosshair,
  ArrowLeftRight,
  GitBranch,
  Hash,
  Gauge,
  Share2,
} from 'lucide-react';
import { GraphNode } from '../../core/hydradb/types.js';

interface SymbolSidePanelProps {
  symbolNode: GraphNode | null;
  onClose: () => void;
  onAnalyzeImpact: (symbolNode: GraphNode) => void;
  onFocusNode?: (symbolNode: GraphNode) => void;
}

type PanelTab = 'overview' | 'dependencies' | 'runtime' | 'history';

function kindIcon(type: string, size = 20) {
  const c = { size, style: { flexShrink: 0 } as React.CSSProperties };
  switch (type) {
    case 'APIEndpoint':
      return <Globe {...c} />;
    case 'Class':
      return <Boxes {...c} />;
    case 'File':
      return <FileCode {...c} />;
    case 'DBSchema':
      return <Database {...c} />;
    case 'Module':
    case 'Repository':
      return <Layers {...c} />;
    case 'HydraDB':
      return <Server {...c} />;
    default:
      return <Code2 {...c} />;
  }
}

function qualColor(v: string): string {
  return v === 'High' ? '#b91c1c' : v === 'Medium' ? '#b45309' : '#059669';
}

export const SymbolSidePanel: React.FC<SymbolSidePanelProps> = ({
  symbolNode,
  onClose,
  onAnalyzeImpact,
  onFocusNode,
}) => {
  const [detail, setDetail] = useState<{ calledBy: GraphNode[]; calls: GraphNode[] }>({ calledBy: [], calls: [] });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pinned, setPinned] = useState<boolean>(false);
  const [hovered, setHovered] = useState<boolean>(false);
  const [tab, setTab] = useState<PanelTab>('overview');
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Kept before any early return so hook order stays stable (Rules of Hooks).
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // The panel is a thin strip by default and expands only while hovered (or
  // when pinned). This keeps the graph/impact space free and never traps the
  // cursor open the way a timed auto-close did.
  // When a symbol is selected/focused, reveal the panel expanded for 5s. If the
  // user doesn't interact (hover) within that window, it collapses to the strip.
  const [temp, setTemp] = useState<boolean>(false);
  const tempTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = pinned || hovered || temp;

  useEffect(() => {
    setTab('overview');
    if (tempTimer.current) clearTimeout(tempTimer.current);
    if (symbolNode) {
      setHovered(false);
      setTemp(true);
      tempTimer.current = setTimeout(() => setTemp(false), 5000);
    } else {
      setTemp(false);
    }
    return () => {
      if (tempTimer.current) clearTimeout(tempTimer.current);
    };
  }, [symbolNode]);

  // Hovering takes over as the reason the panel is open: cancel the 5s reveal
  // timer and clear `temp` so that leaving (hovered=false) collapses it.
  useEffect(() => {
    if (hovered) {
      if (tempTimer.current) {
        clearTimeout(tempTimer.current);
        tempTimer.current = null;
      }
      setTemp(false);
    }
  }, [hovered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!symbolNode) return;
    setIsLoading(true);

    fetch(`/api/symbols/${encodeURIComponent(symbolNode.id)}`)
      .then((res) => res.json())
      .then((data) => {
        setDetail({
          calledBy: data.calledBy || [],
          calls: data.calls || [],
        });
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch symbol details:', err);
        setIsLoading(false);
      });
  }, [symbolNode]);

  if (!symbolNode) return null;

  // Some AST-derived nodes (e.g. DBSchema captured from a large expression) can
  // have enormous names. Clamp the display so it can never overflow the header
  // and push the close button off-screen; the full value stays in the tooltip.
  const rawName = symbolNode.name || '(unnamed)';
  const displayName = rawName.length > 72 ? `${rawName.slice(0, 72)}…` : rawName;

  // Derived, deterministic metrics from the real graph relationships.
  const calls = detail.calls;
  const calledBy = detail.calledBy;
  const degree = calls.length + calledBy.length;
  const complexity = degree <= 3 ? 'Low' : degree <= 8 ? 'Medium' : 'High';
  const impact = calledBy.length === 0 ? 'Low' : calledBy.length <= 3 ? 'Medium' : 'High';
  const loc = symbolNode.startLine && symbolNode.endLine ? symbolNode.endLine - symbolNode.startLine + 1 : 0;
  const typeSummaries: Record<string, string> = {
    Function: 'A function in the code graph. It is affected by changes to what it calls, and its own changes propagate to everything that calls it.',
    Method: 'A class method. Changes here affect its callers along the recorded call edges.',
    Class: 'A class definition grouping related methods and state.',
    APIEndpoint: 'An HTTP endpoint. It exposes a handler and is the entry point for runtime-observed request paths.',
    File: 'A source file containing one or more symbols in the dependency graph.',
    DBSchema: 'A database schema touched by read/write operations in the code.',
    Module: 'A module grouping related files and symbols.',
    HydraDB: 'The HydraDB intelligence layer that stores and retrieves engineering context.',
  };
  const summary = typeSummaries[symbolNode.type] || 'A node in the TRACE dependency graph.';


  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Fixed drawer so it works in normal AND fullscreen graph mode (which
        // renders a fixed overlay). Collapsed to a thin strip; expands on hover/mobile.
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        zIndex: 600,
        width: isMobile ? (expanded ? '100vw' : '40px') : (expanded ? '380px' : '46px'),
        maxWidth: '100vw',
        background: 'var(--bg-secondary)',
        borderLeft: `2px solid ${pinned ? '#0a0a0a' : 'var(--border-color)'}`,
        boxShadow: expanded ? '-10px 0 30px rgba(0,0,0,0.10)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.18s ease',
      }}
    >
      {!expanded ? (
        <div
          title={`${symbolNode.type}: ${rawName} — hover to expand`}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '18px', gap: '14px', cursor: 'pointer' }}
        >
          <span style={{ color: '#71717a' }}>{kindIcon(symbolNode.type, 18)}</span>
          <div
            style={{
              writingMode: 'vertical-rl',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              color: '#0a0a0a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: '60vh',
            }}
          >
            {displayName}
          </div>
        </div>
      ) : (
      <>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', flexShrink: 0 }}>
            {kindIcon(symbolNode.type, 19)}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              title={rawName}
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#0a0a0a',
                margin: 0,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 1.25,
                wordBreak: 'break-all',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {displayName}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{symbolNode.type}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Unpin' : 'Pin open'}
            style={{ background: pinned ? '#0a0a0a' : '#ffffff', border: `1px solid ${pinned ? '#0a0a0a' : 'var(--border-color)'}`, borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: pinned ? '#ffffff' : 'var(--text-muted)', cursor: 'pointer' }}
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            onClick={onClose}
            title="Close"
            style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {(['overview', 'dependencies', 'runtime', 'history'] as PanelTab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === tb ? '#0a0a0a' : 'transparent'}`,
              color: tab === tb ? '#0a0a0a' : 'var(--text-muted)',
              fontWeight: tab === tb ? 700 : 500,
              fontSize: '12.5px',
              padding: '11px 8px',
              marginBottom: '-1px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tb}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: '18px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {isLoading && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>}

        {tab === 'overview' && (
          <>
            {/* Summary */}
            <div>
              <div style={sectionLabel}>Summary</div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '6px 0 0' }}>{summary}</p>
            </div>

            {/* Stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <MiniStat label="Used by" value={calledBy.length} icon={<ArrowLeftRight size={12} />} />
              <MiniStat label="Depends" value={calls.length} icon={<GitBranch size={12} />} />
              <MiniStat label="Lines" value={loc || '—'} icon={<Hash size={12} />} />
              <MiniStat label="Complexity" value={complexity} valueColor={qualColor(complexity)} icon={<Gauge size={12} />} />
              <MiniStat label="Change Impact" value={impact} valueColor={qualColor(impact)} icon={<ShieldAlert size={12} />} />
              <MiniStat label="Connections" value={degree} icon={<Share2 size={12} />} />
            </div>

            {/* Location */}
            <div>
              <div style={sectionLabel}>Location</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <code style={{ fontSize: '12px', color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all', flex: 1 }}>
                  {symbolNode.filePath || 'internal'}{symbolNode.startLine ? `:${symbolNode.startLine}` : ''}
                </code>
                <button
                  onClick={() => navigator.clipboard?.writeText(`${symbolNode.filePath || ''}${symbolNode.startLine ? `:${symbolNode.startLine}` : ''}`)}
                  title="Copy path"
                  style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>

            <DepList title="Depends on" nodes={calls} emptyText="No outgoing dependencies" onPick={onFocusNode} />
            <DepList title="Used by" nodes={calledBy} emptyText="No callers in graph" onPick={onFocusNode} />
          </>
        )}

        {tab === 'dependencies' && (
          <>
            <DepList title={`Depends on (${calls.length})`} nodes={calls} emptyText="No outgoing dependencies" onPick={onFocusNode} expanded />
            <DepList title={`Used by (${calledBy.length})`} nodes={calledBy} emptyText="No callers in graph" onPick={onFocusNode} expanded />
          </>
        )}

        {tab === 'runtime' && (
          <div>
            <div style={sectionLabel}>Runtime evidence</div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '8px 0 14px' }}>
              Runtime observation is recorded per execution trace. Run a scenario from Runtime Traces, then open Change Impact to see whether paths through this symbol are verified or unobserved.
            </p>
            <button onClick={() => onAnalyzeImpact(symbolNode)} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              <ShieldAlert size={15} /> Check verified vs unobserved
            </button>
          </div>
        )}

        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={sectionLabel}>Snapshot metadata</div>
            <MetaRow k="Commit" v={symbolNode.commitSha || 'HEAD'} mono />
            <MetaRow k="Snapshot" v={symbolNode.snapshotId ? symbolNode.snapshotId.slice(0, 16) : '—'} mono />
            <MetaRow k="Type" v={symbolNode.type} />
            <MetaRow k="Indexed" v={symbolNode.createdAt ? new Date(symbolNode.createdAt).toLocaleString() : '—'} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, background: 'var(--bg-secondary)' }}>
        {onFocusNode && (
          <button onClick={() => onFocusNode(symbolNode)} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
            <Crosshair size={15} /> Focus in graph
          </button>
        )}
        <button onClick={() => onAnalyzeImpact(symbolNode)} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
          <ShieldAlert size={16} /> Analyze Change Impact
        </button>
      </div>
      </>
      )}
    </div>
  );
};

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
};

function MiniStat({ label, value, valueColor, icon }: { label: string; value: React.ReactNode; valueColor?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '3px', position: 'relative' }}>
      {icon && <span style={{ position: 'absolute', top: '8px', right: '8px', color: 'var(--text-dim)', display: 'flex' }}>{icon}</span>}
      <span style={{ fontSize: '17px', fontWeight: 800, color: valueColor || '#0a0a0a', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px' }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: '#0a0a0a', fontWeight: 600, fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
    </div>
  );
}

function DepList({ title, nodes, emptyText, onPick, expanded }: { title: string; nodes: GraphNode[]; emptyText: string; onPick?: (n: GraphNode) => void; expanded?: boolean }) {
  const [showAll, setShowAll] = useState<boolean>(!!expanded);
  const shown = showAll ? nodes : nodes.slice(0, 6);
  return (
    <div>
      <div style={{ ...sectionLabel, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{title}</span>
      </div>
      {nodes.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {shown.map((n, idx) => (
            <button
              key={idx}
              onClick={() => onPick && onPick(n)}
              title={n.filePath || n.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '7px',
                cursor: onPick ? 'pointer' : 'default',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text-dim)', display: 'flex' }}>{kindIcon(n.type, 14)}</span>
              <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{n.name}</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>{(n.type || '').slice(0, 3).toUpperCase()}</span>
              {onPick && <ArrowRight size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
            </button>
          ))}
          {!showAll && nodes.length > shown.length && (
            <button
              onClick={() => setShowAll(true)}
              style={{ fontSize: '11px', fontWeight: 600, color: '#0a0a0a', background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              +{nodes.length - shown.length} more
            </button>
          )}
          {showAll && nodes.length > 6 && (
            <button
              onClick={() => setShowAll(false)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', textAlign: 'left' }}
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}
