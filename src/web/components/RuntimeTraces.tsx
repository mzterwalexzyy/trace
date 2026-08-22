import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Loader2,
  Zap,
  Code2,
  Copy,
  Check,
  GitBranch,
  Boxes,
  ShieldCheck,
  Search,
  Upload,
  Share2,
  MoreVertical,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  Info,
} from 'lucide-react';
import { GraphNode } from '../../core/hydradb/types.js';
import { usePaged, Pager } from './Pager.js';

interface TraceItem {
  traceNode: GraphNode;
  spans: GraphNode[];
}

interface RuntimeTracesProps {
  traces: TraceItem[];
  activeRepoName?: string;
  onRefreshTraces?: () => void;
  onSelectNode?: (node: GraphNode) => void;
  onOpenImpact?: (symbolName: string) => void;
}

function relTime(iso?: string): string {
  if (!iso) return 'recorded';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recorded';
  const m = Math.floor((Date.now() - then) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export const RuntimeTraces: React.FC<RuntimeTracesProps> = ({
  traces,
  activeRepoName,
  onRefreshTraces,
  onSelectNode,
  onOpenImpact,
}) => {
  const [selectedTraceIndex, setSelectedTraceIndex] = useState<number>(0);
  const [activeLeftTab, setActiveLeftTab] = useState<'traces' | 'executions' | 'environments'>('traces');
  const [activeRightTab, setActiveRightTab] = useState<'waterfall' | 'timeline' | 'spanlist' | 'metadata'>('waterfall');
  const [searchQuery, setSearchQuery] = useState('');
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Symbol lookup for the empty-state search: fetch the active repo's functions
  // and endpoints so a user can jump straight to a symbol's runtime status
  // (VERIFIED / UNOBSERVED) on the Change Impact page.
  const [lookup, setLookup] = useState('');
  const [symbols, setSymbols] = useState<{ name: string; type: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/graph')
      .then((r) => r.json())
      .then((g) => {
        if (cancelled) return;
        const syms = (g.nodes || [])
          .filter((n: any) => ['Function', 'Method', 'APIEndpoint'].includes(n.type))
          .map((n: any) => ({ name: n.name, type: n.type }));
        // de-dupe by name, keep first
        const seen = new Set<string>();
        setSymbols(syms.filter((s: any) => (seen.has(s.name) ? false : (seen.add(s.name), true))));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeRepoName, traces.length]);

  const lookupMatches = (() => {
    const q = lookup.trim().toLowerCase();
    if (!q) return [] as { name: string; type: string }[];
    const starts = symbols.filter((s) => s.name.toLowerCase().startsWith(q));
    const contains = symbols.filter((s) => !s.name.toLowerCase().startsWith(q) && s.name.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 6);
  })();

  const submitLookup = (name?: string) => {
    const target = (name ?? lookup).trim();
    if (!target || !onOpenImpact) return;
    onOpenImpact(target);
  };

  // Live trace recording only works against the bundled demo app (TRACE ships it
  // instrumented). For any other repo, TRACE cannot execute the code to trace it
  // — the honest paths are uploading a trace from an instrumented app, or looking
  // up a symbol's runtime status. So the "Run demo trace" action is shown only on
  // the demo repo; other repos get Upload as the primary action.
  const isDemoRepo = (activeRepoName || '').toLowerCase() === 'demo-app';

  // Upload = import execution evidence recorded elsewhere / earlier (a TRACE
  // trace JSON), and connect it to the current architecture graph.
  const importTrace = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/runtime/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trace: parsed.trace || parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
      if (onRefreshTraces) onRefreshTraces();
    } catch (err: any) {
      alert(`Could not import trace: ${err.message}`);
    }
  };

  const runScenario = async (scenario: 'checkout' | 'invoice') => {
    setRunningScenario(scenario);
    try {
      const res = await fetch('/api/runtime/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to record runtime execution');
      if (onRefreshTraces) onRefreshTraces();
    } catch (err: any) {
      console.error(err);
    } finally {
      setRunningScenario(null);
    }
  };

  // Metrics calculation
  const totalTraces = traces.length;
  const totalDurationMs = traces.reduce((acc, t) => {
    const dur = Math.max(0, ...t.spans.map((s) => Number(s.metadata?.duration) || 0));
    return acc + dur;
  }, 0);

  const totalSpans = traces.reduce((acc, t) => acc + t.spans.length, 0);
  const totalSuccessful = traces.reduce((acc, t) => {
    const ok = t.spans.every((s) => s.metadata?.success !== false);
    return acc + (ok ? 1 : 0);
  }, 0);

  const totalErrors = traces.reduce((acc, t) => {
    const errs = t.spans.filter((s) => s.metadata?.success === false).length;
    return acc + errs;
  }, 0);

  const avgSpans = totalTraces > 0 ? Math.round(totalSpans / totalTraces) : 0;

  const activeTrace = traces[selectedTraceIndex] || null;
  const tracesPage = usePaged(traces, 5);

  // Real spans only — never fabricated. Empty when no trace is selected, so the
  // waterfall shows an honest empty state instead of a fake demo call tree.
  const maxDur = activeTrace ? Math.max(1, ...activeTrace.spans.map((s) => Number(s.metadata?.duration) || 0)) : 1;
  const renderSpans = activeTrace
    ? activeTrace.spans.map((s, i) => {
        const dur = Number(s.metadata?.duration) || 0;
        const depth = Number(s.metadata?.depth) || 0;
        return {
          name: s.name,
          type: s.type,
          duration: dur,
          depth,
          startPct: Math.min(70, i * 6),
          widthPct: Math.max(6, Math.round((dur / maxDur) * 100)),
          isEndpoint: s.type === 'APIEndpoint',
        };
      })
    : [];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.02em' }}>
            Runtime
          </h1>
          <p style={{ color: '#71717a', fontSize: '14px', margin: '4px 0 0 0' }}>
            See what actually happened in your application.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => fileRef.current?.click()}
            title="Import execution evidence recorded earlier or by another run (a TRACE trace .json)."
            style={{
              background: '#ffffff',
              color: '#09090b',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={15} /> Upload trace
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importTrace(f); e.currentTarget.value = ''; }}
          />

          {isDemoRepo && (
            <button
              onClick={() => runScenario('checkout')}
              disabled={runningScenario !== null}
              title="Watch a new execution: TRACE runs the bundled demo app and records the real call tree."
              style={{
                background: '#000000',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {runningScenario ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              Run demo trace
            </button>
          )}
        </div>
      </div>

      {traces.length === 0 ? (
        /* Empty state: no runtime evidence for this repo yet. Mirrors the
           Change Impact "no analysis" state — one centered call to action with a
           short explanation and a lookup to check a symbol's runtime status. */
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '52px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '18px' }}>
          <div style={{ width: '58px', height: '58px', borderRadius: '15px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Activity size={27} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#09090b', margin: 0, letterSpacing: '-0.01em' }}>
              No runtime traces for {activeRepoName || 'this repository'} yet
            </h2>
            <p style={{ fontSize: '13.5px', color: '#71717a', maxWidth: '580px', margin: '10px auto 0', lineHeight: 1.6 }}>
              Architecture shows what your code <strong>could</strong> do. Runtime shows what it <strong style={{ color: '#09090b' }}>actually did</strong> — the real functions and routes that executed, so Change Impact can mark each path VERIFIED or UNOBSERVED.
              {isDemoRepo
                ? ' Run the demo trace to capture a live execution now.'
                : ` TRACE can't execute ${activeRepoName || 'this repo'} to trace it — instrument your app with the TRACE tracing SDK and upload the trace here, or look up a symbol below to see its runtime status.`}
            </p>
          </div>

          {/* Lookup: jump to a symbol's runtime status on Change Impact */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '460px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa' }} />
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitLookup(); }}
              placeholder="Look up a function or route…"
              style={{ width: '100%', padding: '12px 14px 12px 40px', background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', color: '#09090b', boxSizing: 'border-box' }}
            />
            {lookupMatches.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 20, overflow: 'hidden', textAlign: 'left' }}>
                {lookupMatches.map((s) => (
                  <button key={s.name} onClick={() => submitLookup(s.name)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid #f4f4f5', cursor: 'pointer' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: '#09090b' }}>{s.name}</span>
                    <span style={{ fontSize: '11px', color: '#a1a1aa', marginLeft: 'auto' }}>{s.type === 'APIEndpoint' ? 'route' : 'function'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={{ fontSize: '11.5px', color: '#a1a1aa', marginTop: '-8px' }}>Search a function or route to check whether it is exercised at runtime.</span>

          {/* Primary actions — live recording is only possible for the demo app. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
            {isDemoRepo && (
              <button onClick={() => runScenario('checkout')} disabled={runningScenario !== null} style={{ background: '#000000', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {runningScenario ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Run demo trace
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} style={{ background: isDemoRepo ? '#ffffff' : '#000000', color: isDemoRepo ? '#09090b' : '#ffffff', border: isDemoRepo ? '1px solid #e4e4e7' : 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Upload size={15} /> Upload trace
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* 5 Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        {/* Card 1: Traces recorded */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Activity size={16} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {totalTraces}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Traces recorded</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>{totalTraces > 0 ? 'Active in graph' : 'No traces yet'}</div>
          </div>
        </div>

        {/* Card 2: Total duration */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Clock size={16} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {totalDurationMs} ms
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Total duration</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>{totalTraces > 0 ? 'Aggregated spans' : 'No traces yet'}</div>
          </div>
        </div>

        {/* Card 3: Successful */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={16} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981', lineHeight: '1.1' }}>
              {totalSuccessful}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Successful</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>{totalTraces > 0 ? 'Clean executions' : 'No traces yet'}</div>
          </div>
        </div>

        {/* Card 4: Errors */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <AlertTriangle size={16} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {totalErrors}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Errors</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>{totalTraces > 0 ? 'Failed spans' : 'No traces yet'}</div>
          </div>
        </div>

        {/* Card 5: Avg. spans per trace */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <GitBranch size={16} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {avgSpans}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Avg. spans per trace</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>{totalTraces > 0 ? 'Call depth' : 'No traces yet'}</div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>
        {/* LEFT COLUMN: Traces Navigation List */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e4e4e7', paddingBottom: '8px', fontSize: '13px', fontWeight: '600', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            <span
              onClick={() => setActiveLeftTab('traces')}
              style={{ cursor: 'pointer', color: activeLeftTab === 'traces' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'traces' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Traces
            </span>
            <span
              onClick={() => setActiveLeftTab('executions')}
              style={{ cursor: 'pointer', color: activeLeftTab === 'executions' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'executions' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Executions
            </span>
            <span
              onClick={() => setActiveLeftTab('environments')}
              style={{ cursor: 'pointer', color: activeLeftTab === 'environments' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'environments' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Environments
            </span>
          </div>

          {/* Search & Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#a1a1aa' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search traces..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#09090b',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <select
              style={{
                padding: '7px 10px',
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#09090b',
              }}
            >
              <option value="all">All status</option>
              <option value="verified">Verified</option>
              <option value="unobserved">Unobserved</option>
            </select>
          </div>

          {/* List or Empty State */}
          {traces.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>
                <Search size={24} />
              </div>
              <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#09090b', margin: 0 }}>
                No runtime traces yet
              </h4>
              <p style={{ fontSize: '12px', color: '#71717a', margin: 0, lineHeight: '1.5' }}>
                Run your application or use the demo to record and view execution traces.
              </p>

              <button
                onClick={() => runScenario('checkout')}
                disabled={runningScenario !== null}
                style={{
                  background: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '8px',
                }}
              >
                {runningScenario ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run demo application
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {tracesPage.pageItems.map((trace, i) => {
                const idx = tracesPage.page * 5 + i;
                return (
                <div
                  key={idx}
                  onClick={() => setSelectedTraceIndex(idx)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedTraceIndex === idx ? '#09090b' : '#f4f4f5'}`,
                    background: selectedTraceIndex === idx ? '#f4f4f5' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', color: '#09090b' }}>
                      {trace.traceNode.name}
                    </span>
                    <span style={{ fontSize: '10px', color: '#10b981', background: '#ecfdf5', padding: '1px 6px', borderRadius: '4px' }}>
                      VERIFIED
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#71717a' }}>
                    <span>{trace.spans.length} spans · {trace.spans.reduce((a, s) => a + (Number(s.metadata?.duration) || 0), 0)} ms</span>
                    <span>{trace.traceNode.metadata?.imported ? 'Imported' : relTime(trace.traceNode.metadata?.startTime as string)}</span>
                  </div>
                </div>
                );
              })}
              <Pager page={tracesPage.page} totalPages={tracesPage.totalPages} setPage={tracesPage.setPage} total={tracesPage.total} label="traces" />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Trace Inspector & Waterfall Chart */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#09090b', margin: 0 }}>
                {activeTrace ? activeTrace.traceNode.name : 'No trace selected'}
              </h3>
              <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
                {activeTrace ? `Inspecting execution details for ${activeTrace.traceNode.id}` : 'Select a trace from the list to inspect execution details.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: '#09090b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Share2 size={13} /> Share
              </button>
              <button style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 8px', color: '#71717a', cursor: 'pointer' }}>
                <MoreVertical size={14} />
              </button>
            </div>
          </div>

          {/* Sub-tabs & Waterfall Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e4e4e7', paddingBottom: '8px', fontSize: '13px', fontWeight: '600', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span
                onClick={() => setActiveRightTab('waterfall')}
                style={{ cursor: 'pointer', color: activeRightTab === 'waterfall' ? '#09090b' : '#a1a1aa', borderBottom: activeRightTab === 'waterfall' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
              >
                Waterfall
              </span>
              <span
                onClick={() => setActiveRightTab('timeline')}
                style={{ cursor: 'pointer', color: activeRightTab === 'timeline' ? '#09090b' : '#a1a1aa', borderBottom: activeRightTab === 'timeline' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
              >
                Timeline
              </span>
              <span
                onClick={() => setActiveRightTab('spanlist')}
                style={{ cursor: 'pointer', color: activeRightTab === 'spanlist' ? '#09090b' : '#a1a1aa', borderBottom: activeRightTab === 'spanlist' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
              >
                Span List
              </span>
              <span
                onClick={() => setActiveRightTab('metadata')}
                style={{ cursor: 'pointer', color: activeRightTab === 'metadata' ? '#09090b' : '#a1a1aa', borderBottom: activeRightTab === 'metadata' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
              >
                Metadata
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
              <span>Expand all ⌄</span>
              <span>Group by: None ⌄</span>
              <button style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ZoomOut size={12} /></button>
              <button style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ZoomIn size={12} /></button>
            </div>
          </div>

          {/* Timeline Time Scale Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderBottom: '1px solid #f4f4f5', paddingBottom: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#71717a' }}>Span / Call Tree</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#a1a1aa', fontFamily: 'JetBrains Mono, monospace' }}>
              <span>0 ms</span>
              <span>100 ms</span>
              <span>200 ms</span>
              <span>300 ms</span>
              <span>400 ms</span>
              <span>500 ms</span>
              <span>600 ms</span>
              <span>700 ms</span>
              <span>800 ms</span>
            </div>
          </div>

          {/* Waterfall Gantt Chart Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '320px' }}>
            {renderSpans.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', textAlign: 'center', padding: '40px 20px' }}>
                <Activity size={28} style={{ opacity: 0.4, marginBottom: '10px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#71717a' }}>No execution to display</div>
                <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '360px' }}>
                  {totalTraces > 0 ? 'Select a trace from the list to inspect its real call tree.' : 'Record a trace to capture a real execution waterfall.'}
                </div>
              </div>
            )}
            {renderSpans.map((span, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid #f4f4f5',
                }}
              >
                {/* Left Span Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: `${span.depth * 14}px`, overflow: 'hidden' }}>
                  <ChevronDown size={12} style={{ color: '#a1a1aa', flexShrink: 0 }} />
                  {span.isEndpoint ? (
                    <Globe size={13} style={{ color: '#09090b', flexShrink: 0 }} />
                  ) : span.type === 'DBSchema' ? (
                    <Database size={13} style={{ color: '#09090b', flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#71717a', fontStyle: 'italic' }}>f</span>
                  )}
                  <span style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'JetBrains Mono, monospace', color: '#09090b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {span.name}
                  </span>
                  <span style={{ fontSize: '11px', color: span.isEndpoint ? '#10b981' : '#71717a', background: span.isEndpoint ? '#ecfdf5' : '#f4f4f5', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                    {span.duration} ms
                  </span>
                </div>

                {/* Right Gantt Bar Canvas */}
                <div style={{ position: 'relative', height: '14px', background: '#fafafa', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: `${span.startPct}%`,
                      width: `${span.widthPct}%`,
                      height: '100%',
                      background: span.isEndpoint ? '#a7f3d0' : '#bbf7d0',
                      borderRadius: '3px',
                      border: '1px solid #86efac',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Disclaimer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#71717a', borderTop: '1px solid #f4f4f5', paddingTop: '10px' }}>
            <Info size={13} />
            <span>Select a trace from the left list to view exact execution duration and span details.</span>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
