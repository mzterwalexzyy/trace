import React, { useState } from 'react';
import { ShieldAlert, Globe, Database, ArrowRight, Zap, CheckCircle2, AlertTriangle, Search, ChevronRight, Code2, Boxes, Network, GitBranch, Crosshair } from 'lucide-react';
import { ChangeImpactReport } from '../../core/impact/intersection.js';
import { GraphNode } from '../../core/hydradb/types.js';

interface ChangeImpactHeroProps {
  report: ChangeImpactReport | null;
  loading?: boolean;
  onSelectNodeInGraph?: (node: GraphNode) => void;
  onSearchSymbol?: (symbolName: string) => void;
}

export const ChangeImpactHero: React.FC<ChangeImpactHeroProps> = ({
  report,
  loading,
  onSelectNodeInGraph,
  onSearchSymbol,
}) => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [examples, setExamples] = useState<string[]>([]);

  // Keep the search box in sync with whatever symbol is actually being analyzed
  // (e.g. when the report arrives from the graph, Runtime page, or a switch),
  // so it never shows a stale value like a previous symbol.
  React.useEffect(() => {
    if (report?.targetSymbol?.name) setSearchInput(report.targetSymbol.name);
  }, [report?.targetSymbol?.id]);

  // Example/suggested symbols are drawn from the ACTUAL analyzed repo (endpoints
  // + a few functions). Fetched on mount so they're available in the empty
  // state too — Change Impact never auto-analyzes a symbol on its own.
  const repoSnapshot = report?.targetSymbol?.snapshotId;
  React.useEffect(() => {
    fetch('/api/symbols')
      .then((r) => r.json())
      .then((d) => {
        const nodes = (d.symbols || []).map((s: any) => s.node);
        const eps = nodes.filter((n: any) => n.type === 'APIEndpoint').map((n: any) => n.name);
        const fns = nodes.filter((n: any) => n.type === 'Function' || n.type === 'Method').map((n: any) => n.name);
        setExamples([...eps.slice(0, 2), ...fns.slice(0, 3)].slice(0, 4));
      })
      .catch(() => setExamples([]));
  }, [repoSnapshot]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim() && onSearchSymbol) {
      onSearchSymbol(searchInput.trim());
    }
  };

  const handleExampleClick = (sym: string) => {
    setSearchInput(sym);
    if (onSearchSymbol) onSearchSymbol(sym);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '60px 24px', color: 'var(--text-muted)' }}>
          <ShieldAlert size={36} style={{ margin: '0 auto 16px', color: '#0a0a0a' }} className="pulse" />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0a0a0a', marginBottom: '8px' }}>Analyzing change impact…</h2>
          <p style={{ fontSize: '14px', maxWidth: '540px', margin: '0 auto' }}>
            Traversing the dependency graph and correlating runtime evidence.
          </p>
        </div>
      </div>
    );
  }

  if (!report || !report.targetSymbol) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0a0a0a', margin: 0, letterSpacing: '-0.02em' }}>Change Impact</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>Pick a symbol to see what a change to it could affect.</p>
        </div>
        <div className="card" style={{ padding: '40px 28px', textAlign: 'center' }}>
          <CheckCircle2 size={30} style={{ margin: '0 auto 14px', color: '#059669' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0a0a0a', marginBottom: '6px' }}>Repository analyzed</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 22px' }}>
            TRACE has built the static graph for this repository. Search a function, endpoint or file to compute its change impact — or start from a suggestion.
          </p>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', maxWidth: '520px', margin: '0 auto 18px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search a symbol, file or endpoint…"
                style={{ width: '100%', padding: '9px 12px 9px 38px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '9px 16px' }}>Analyze <ArrowRight size={15} /></button>
          </form>
          {examples.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Suggested starting point:</span>
              {examples.slice(0, 3).map((ex, idx) => (
                <button key={idx} onClick={() => handleExampleClick(ex)} style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#0a0a0a', padding: '5px 11px', borderRadius: '7px', cursor: 'pointer' }}>{ex}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Route-level runtime coverage, derived from the same endpoint list shown in
  // the "Runtime evidence" panel — so the summary numbers always agree with it.
  // (Caller-chain path counts are empty when the target itself is an endpoint.)
  const verifiedRoutes = report.endpoints.filter((e) => e.status === 'VERIFIED').length;
  const unobservedRoutes = report.endpoints.filter((e) => e.status === 'UNOBSERVED').length;
  const totalRoutes = report.endpoints.length;

  // Deterministic risk level from blast radius: more reachable nodes + unverified
  // routes = higher risk. Purely structural, never probabilistic.
  const affected = report.totalAffectedNodes;
  const risk = affected > 60 || unobservedRoutes > 2 ? 'High' : affected > 12 || unobservedRoutes > 0 ? 'Medium' : 'Low';
  const riskColor = risk === 'High' ? '#b91c1c' : risk === 'Medium' ? '#b45309' : '#059669';
  const tgt = report.targetSymbol;

  const summaryCards = [
    { icon: <Boxes size={15} />, value: report.totalAffectedNodes, label: 'Affected nodes' },
    { icon: <Network size={15} />, value: report.endpoints.length, label: 'API endpoints' },
    { icon: <Database size={15} />, value: report.dbSchemas.length, label: 'DB dependencies' },
    { icon: <CheckCircle2 size={15} />, value: verifiedRoutes, label: 'Verified routes', color: '#059669' },
    { icon: <AlertTriangle size={15} />, value: unobservedRoutes, label: 'Unobserved routes', color: unobservedRoutes ? '#d97706' : '#0a0a0a' },
    { icon: <ShieldAlert size={15} />, value: risk, label: 'Change risk', color: riskColor },
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header row: title on the left, search + analyze on the right */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0a0a0a', margin: 0, letterSpacing: '-0.02em' }}>Change Impact</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>Understand what your changes can affect.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flex: '1 1 480px', maxWidth: '640px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', flex: '1 1 320px', minWidth: '240px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search a symbol, file or endpoint…"
                style={{ width: '100%', padding: '9px 12px 9px 38px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', boxSizing: 'border-box' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '9px 16px', borderRadius: '8px', flexShrink: 0 }}>
              Analyze <ArrowRight size={15} />
            </button>
          </form>
          {onSelectNodeInGraph && (
            <button className="btn" style={{ flexShrink: 0 }} onClick={() => onSelectNodeInGraph(tgt)} title="Focus this symbol in the Architecture graph">
              <Crosshair size={14} /> View in graph
            </button>
          )}
        </div>
      </div>

      {/* Slim example chips + target line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>Impact for</span>
        <span style={{ fontSize: '14px', fontWeight: 800, color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace' }}>{tgt.name}</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#ffffff', background: '#0a0a0a', borderRadius: '5px', padding: '2px 6px' }}>{tgt.type}</span>
        <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>{tgt.filePath || 'internal'}{tgt.startLine ? `:${tgt.startLine}` : ''}</span>
        {examples.length > 0 && <span style={{ color: 'var(--border-color)' }}>·</span>}
        {examples.slice(0, 3).map((ex, idx) => (
          <button key={idx} onClick={() => handleExampleClick(ex)} style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '3px 9px', borderRadius: '6px', cursor: 'pointer' }}>{ex}</button>
        ))}
      </div>

      {/* Impact summary — icon stat cards, consistent with the rest of the app */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {summaryCards.map((c, i) => (
          <div key={i} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color || '#0a0a0a' }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: c.color || '#0a0a0a', lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Left Column: What Could Be Affected Tree Graph */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0a0a0a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code2 size={18} style={{ color: '#0a0a0a' }} />
              What could be affected
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
              Everything that depends on this code. If you change it, these are the paths that <strong>could</strong> break.
            </p>
          </div>

          {/* Root Target Symbol */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderLeft: '3px solid #0a0a0a', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: '#ffffff', background: '#0a0a0a', borderRadius: '4px', padding: '3px 6px', flexShrink: 0 }}>CHANGED</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.targetSymbol.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                {report.targetSymbol.filePath || report.targetSymbol.type}
                {report.targetSymbol.startLine ? `:${report.targetSymbol.startLine}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '2px', height: '20px', background: 'var(--border-color)' }} />
          </div>

          {/* Reachable branches — or, when the target has no endpoint paths,
              the concrete things it still touches (schemas, tests). */}
          {report.classifiedPaths.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {report.classifiedPaths.slice(0, 4).map((cp, idx) => (
                <div
                  key={idx}
                  onClick={() => cp.targetEndpoint && onSelectNodeInGraph && onSelectNodeInGraph(cp.targetEndpoint)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${cp.status === 'VERIFIED' ? 'rgba(5, 150, 105, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cp.targetEndpoint?.name || cp.path.nodes[cp.path.nodes.length - 1]?.name || 'Target Path'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cp.path.nodes.map((n) => n.name).join(' → ')}
                    </div>
                  </div>
                  <span className={cp.status === 'VERIFIED' ? 'badge badge-verified' : 'badge badge-unobserved'} style={{ flexShrink: 0 }}>
                    {cp.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {report.dbSchemas.map((s: any, idx: number) => (
                <div key={`s${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '11px 14px' }}>
                  <Database size={15} style={{ color: '#059669', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(s.schemaNode || s).name}</span>
                </div>
              ))}
              {report.tests.slice(0, 4).map((t: any, idx: number) => (
                <div key={`t${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '11px 14px' }}>
                  <CheckCircle2 size={15} style={{ color: '#71717a', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(t.name || t)}</span>
                </div>
              ))}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Changing <code>{tgt.name}</code> reaches <strong>{report.totalAffectedNodes}</strong> nodes across the dependency graph. This symbol isn't behind an HTTP route, so there are no request paths to verify — open the Architecture graph to trace its callers and callees.
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Runtime Evidence */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '560px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0a0a0a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#059669' }} />
              Runtime evidence
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
              Of the routes above, which have <strong style={{ color: '#059669' }}>actually been seen running</strong> (verified) versus <strong style={{ color: '#b45309' }}>never observed</strong> (a blind spot).
            </p>
          </div>

          {/* Scrolls internally so a big repo (dozens of routes) never balloons the page. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px', minHeight: 0 }}>
            {[...report.endpoints]
              .sort((a, b) => (a.status === b.status ? 0 : a.status === 'VERIFIED' ? -1 : 1))
              .map((ep, idx) => (
              <div
                key={idx}
                onClick={() => ep.endpointNode && onSelectNodeInGraph && onSelectNodeInGraph(ep.endpointNode)}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: onSelectNodeInGraph ? 'pointer' : 'default',
                  flexShrink: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ep.endpointNode.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {ep.status === 'VERIFIED'
                      ? `Observed in ${ep.traceCount} recorded ${ep.traceCount === 1 ? 'trace' : 'traces'}`
                      : 'No runtime evidence recorded'}
                  </div>
                </div>
                <span className={ep.status === 'VERIFIED' ? 'badge badge-verified' : 'badge badge-unobserved'} style={{ flexShrink: 0 }}>
                  ● {ep.status}
                </span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <ChevronRight size={14} />
            {verifiedRoutes} of {totalRoutes} affected {totalRoutes === 1 ? 'route' : 'routes'} verified at runtime
          </div>
        </div>
      </div>

      {/* Blind-spots explainer (a summary, not a duplicate of the list above) */}
      {unobservedRoutes > 0 && (
        <div style={{
          background: 'rgba(217, 119, 6, 0.07)',
          border: '1px solid rgba(217, 119, 6, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <AlertTriangle size={22} style={{ color: '#d97706', flexShrink: 0 }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: '#b45309' }}>{unobservedRoutes} blind {unobservedRoutes === 1 ? 'spot' : 'spots'}.</strong>{' '}
            {unobservedRoutes === 1 ? 'This route can' : 'These routes can'} reach <code>{tgt.name}</code>, but TRACE has never seen {unobservedRoutes === 1 ? 'it' : 'them'} run — so a change here could break {unobservedRoutes === 1 ? 'it' : 'them'} without any test or trace catching it. Record a run from <strong>Runtime Traces</strong> to turn {unobservedRoutes === 1 ? 'it' : 'them'} green.
          </p>
        </div>
      )}

      {/* HydraDB Context Recall Card */}
      {report.hydraContext && report.hydraContext.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px', color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} style={{ color: '#71717a' }} />
            HydraDB Context Recall ({report.hydraContext.length} results)
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
            TRACE stores notes about your code in HydraDB (a cloud memory). Here are the most relevant notes it found for <code>{tgt.name}</code> — extra context to help you judge the change.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
            {report.hydraContext.map((ctx, idx) => (
              <div key={idx} style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: '#71717a' }}>
                    Source: {ctx.metadata?.filePath || ctx.metadata?.source_id || 'Hydra Cloud'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#059669' }}>Relevance {ctx.score.toFixed(2)}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{ctx.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
