import React, { useState } from 'react';
import { Activity, Clock, CheckCircle2, XCircle, Play, Loader2, Zap, Code2, Copy, Check, GitBranch, Boxes, ShieldCheck } from 'lucide-react';
import { GraphNode } from '../../core/hydradb/types.js';

interface TraceItem {
  traceNode: GraphNode;
  spans: GraphNode[];
}

interface RuntimeTracesProps {
  traces: TraceItem[];
  activeRepoName?: string;
  onRefreshTraces?: () => void;
  onSelectNode?: (node: GraphNode) => void;
}

const SDK_SNIPPET = `import { trace } from '@trace/runtime';

// Wrap your Express app (or any handler)
app.use(trace.middleware());

// …or instrument a single function
export const calculateTax = trace.fn('calculateTax', (amount) => {
  return amount * 0.075;
});`;

export const RuntimeTraces: React.FC<RuntimeTracesProps> = ({ traces, activeRepoName, onRefreshTraces, onSelectNode }) => {
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isDemo = (activeRepoName || '') === 'demo-app';

  const runScenario = async (scenario: 'checkout' | 'invoice') => {
    setRunningScenario(scenario);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/runtime/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to record runtime execution');
      setFeedbackMsg({ ok: true, text: data.message });
      if (onRefreshTraces) onRefreshTraces();
    } catch (err: any) {
      setFeedbackMsg({ ok: false, text: err.message });
    } finally {
      setRunningScenario(null);
    }
  };

  const totalSpans = traces.reduce((acc, t) => acc + t.spans.length, 0);

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0a0a0a', margin: 0, letterSpacing: '-0.02em' }}>Runtime Traces</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0 0' }}>
          Static analysis tells TRACE what <em>could</em> happen. Runtime tracing tells TRACE what <em>actually</em> happened.
        </p>
      </div>

      {/* What TRACE knows: static vs runtime → intersection */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 200px' }}>
          <CheckCircle2 size={18} style={{ color: '#059669', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>Static graph</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Available — {activeRepoName || 'repository'} analyzed</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 200px' }}>
          <span style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${totalSpans > 0 ? '#059669' : 'var(--border-color)'}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>Runtime evidence</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{traces.length} traces · {totalSpans} spans{totalSpans === 0 ? ' — no executions observed yet' : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 200px' }}>
          <ShieldCheck size={18} style={{ color: totalSpans > 0 ? '#059669' : 'var(--text-dim)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>Intersection</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>VERIFIED where static meets runtime · UNOBSERVED otherwise</div>
          </div>
        </div>
      </div>

      {/* Top: action (left) + how-it-works (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '18px', alignItems: 'start' }}>
        {isDemo ? (
          <div className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={17} /> Record a demo request
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              TRACE runs a request through the bundled demo app in-process and records the real call tree.
              Run <code>POST /api/checkout</code> to see its path become runtime-verified while <code>GET /api/invoice</code> stays unobserved.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => runScenario('checkout')} className="btn btn-primary" disabled={runningScenario !== null}>
                {runningScenario === 'checkout' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run POST /api/checkout
              </button>
              <button onClick={() => runScenario('invoice')} className="btn" disabled={runningScenario !== null}>
                {runningScenario === 'invoice' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run GET /api/invoice
              </button>
            </div>
            {feedbackMsg && (
              <div style={{ marginTop: '12px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: feedbackMsg.ok ? '#059669' : '#dc2626' }}>
                {feedbackMsg.ok ? '✓ ' : '✗ '}{feedbackMsg.text}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Code2 size={17} /> Trace <code>{activeRepoName || 'your app'}</code>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
              TRACE builds the static graph from source automatically, but runtime evidence has to come from the app
              actually running. Add the tracing SDK to <code>{activeRepoName || 'your app'}</code> and every request it
              serves streams its real call tree back here — no code runs on your behalf.
            </p>
            <div style={{ position: 'relative' }}>
              <pre style={{ margin: 0, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', fontSize: '12px', lineHeight: 1.6, color: '#0a0a0a', overflowX: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
                {SDK_SNIPPET}
              </pre>
              <button
                onClick={() => { navigator.clipboard?.writeText(SDK_SNIPPET); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="btn"
                style={{ position: 'absolute', top: '8px', right: '8px', padding: '5px 8px', fontSize: '11px' }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginTop: '12px' }}>
              Prefer to see it live first? Switch to the <strong>demo-app</strong> repository to record real traces in one click.
            </p>
          </div>
        )}

        {/* How runtime verification works */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a', margin: 0 }}>How verification works</h3>
          {[
            { icon: <Boxes size={15} />, t: 'Static graph', d: 'AST parsing finds every path a change could reach.' },
            { icon: <Activity size={15} />, t: 'Runtime traces', d: 'Instrumented requests record the paths that actually ran.' },
            { icon: <ShieldCheck size={15} />, t: 'Intersection', d: 'Paths with trace evidence are VERIFIED; the rest are UNOBSERVED blind spots.' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '11px' }}>
              <div style={{ width: '30px', height: '30px', flexShrink: 0, borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a' }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>{s.t}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recorded traces */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', color: '#0a0a0a', margin: 0 }}>
            <Activity size={17} /> Recorded execution traces
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{traces.length} traces · {totalSpans} spans</span>
        </div>

        {traces.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
            <Activity size={30} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#0a0a0a' }} />
            <h3 style={{ fontSize: '15px', color: '#0a0a0a', marginBottom: '6px' }}>No runtime traces yet</h3>
            <p style={{ fontSize: '13px', maxWidth: '460px', margin: '0 auto' }}>
              {isDemo
                ? 'TRACE has analyzed the demo but has not observed it running. Record a request above to capture execution evidence.'
                : 'Once the tracing SDK is added and the app serves a request, its trace appears here.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {traces.map((trace, idx) => {
              const maxDur = Math.max(1, ...trace.spans.map((s) => Number(s.metadata?.duration) || 0));
              return (
                <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="badge badge-verified">● Runtime verified</span>
                      <code style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>{trace.traceNode.name}</code>
                    </div>
                    <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                      {trace.traceNode.metadata?.startTime ? new Date(trace.traceNode.metadata.startTime).toLocaleTimeString() : `${trace.spans.length} spans`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {trace.spans.map((span, sIdx) => {
                      const depth = typeof span.metadata?.depth === 'number' ? span.metadata.depth : 0;
                      const success = span.metadata?.success !== false;
                      const dur = Number(span.metadata?.duration) || 0;
                      return (
                        <div
                          key={sIdx}
                          onClick={() => onSelectNode && onSelectNode(span)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', borderRadius: '7px', cursor: onSelectNode ? 'pointer' : 'default', marginLeft: `${depth * 20}px`, transition: 'background 0.12s ease' }}
                        >
                          {success ? <CheckCircle2 size={14} style={{ color: 'var(--status-verified)', flexShrink: 0 }} /> : <XCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />}
                          <span style={{ fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a', minWidth: '180px', flexShrink: 0 }}>{span.name}</span>
                          <div style={{ flex: 1, height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(4, (dur / maxDur) * 100)}%`, height: '100%', background: '#0a0a0a', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', width: '64px', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <Clock size={11} /> {dur}ms
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
