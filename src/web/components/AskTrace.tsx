import React, { useEffect, useState } from 'react';
import { Sparkles, Search, Loader2, ArrowRight, ChevronRight, Database, Cpu } from 'lucide-react';
import type { TabId } from './Sidebar.js';

interface AskTraceProps {
  activeRepoName?: string;
  onOpenImpact: (symbolName: string) => void;
  onNavigate: (tab: TabId) => void;
}

interface Light { id: string; name: string; type: string; filePath?: string }
interface AskResponse {
  question: string;
  intent: string;
  resolvedTargets: Light[];
  resolution?: { confidence: number; alternatives: Light[] };
  evidence: any;
  answerMode: 'evidence' | 'ai';
  aiError?: string;
  answer: string;
  followUps: string[];
}

const INTENT_LABEL: Record<string, string> = {
  symbol_relationship: 'Relationships',
  change_impact: 'Change impact',
  runtime_verification: 'Runtime verification',
  database_dependency: 'Database dependency',
  test_coverage: 'Test coverage',
  architecture_exploration: 'Architecture',
  hydra_context_search: 'Engineering context',
};

const SUGGESTIONS = [
  'What could break if I change calculateTax?',
  'How does checkout depend on tax calculation?',
  'Is calculateTax actually executed at runtime?',
  'What writes to the orders table?',
];

const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)' };

export const AskTrace: React.FC<AskTraceProps> = ({ activeRepoName, onOpenImpact, onNavigate }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setQuestion(query);
    setLoading(true);
    setError(null);
    setResult(null);
    setShowContext(false);
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: query }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ask failed');
      setResult(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const ev = result?.evidence || {};
  const primary = result?.resolvedTargets?.[0];
  const conf = result?.resolution?.confidence ?? 0;
  const alts = result?.resolution?.alternatives ?? [];
  const isAI = result?.answerMode === 'ai';
  const ctx = (ev.hydraContext || []) as any[];

  return (
    <div style={{ padding: '32px', maxWidth: '860px', margin: '0 auto' }}>
      {/* Heading */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={22} /> Ask TRACE
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Understand <strong>{activeRepoName || 'your codebase'}</strong> through architecture, runtime, dependencies and engineering context.
        </p>
      </div>

      {/* Input */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search size={17} style={{ position: 'absolute', left: '15px', top: '15px', color: 'var(--text-muted)' }} />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(question)}
          placeholder="Ask about your codebase…"
          style={{ width: '100%', padding: '14px 116px 14px 44px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', color: '#0a0a0a', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }}
        />
        <button className="btn btn-primary" onClick={() => ask(question)} disabled={loading} style={{ position: 'absolute', right: '8px', top: '8px', padding: '8px 15px' }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <>Ask <ArrowRight size={14} /></>}
        </button>
      </div>

      {/* Suggestions (initial state) */}
      {!result && !loading && (
        <div>
          <div style={{ ...label, marginBottom: '10px' }}>Try asking</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} style={{ textAlign: 'left', fontSize: '14px', color: '#0a0a0a', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0a0a0a')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}>
                {s} <ChevronRight size={15} style={{ color: 'var(--text-dim)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
          <Cpu size={18} className="pulse" style={{ color: '#0a0a0a' }} />
          <span style={{ fontSize: '14px' }}>TRACE is investigating — resolving symbols, traversing the graph, checking runtime evidence…</span>
        </div>
      )}

      {error && <div className="card" style={{ border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: '13px' }}>{error}</div>}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Question echo */}
          <div style={{ paddingTop: '4px' }}>
            <div style={{ ...label, marginBottom: '6px' }}>Question</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0a0a0a' }}>{result.question}</div>
          </div>

          {/* Resolution / confidence — progressive disclosure */}
          {primary && (
            <ResolutionLine primary={primary} confidence={conf} alternatives={alts} onPick={onOpenImpact} />
          )}

          {/* AI explanation — the star */}
          <div className="card" style={{ borderLeft: '3px solid #0a0a0a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={label}>{isAI ? 'AI Explanation' : 'TRACE Evidence'}</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em', color: isAI ? '#047857' : 'var(--text-dim)', background: isAI ? 'rgba(5,150,105,0.10)' : 'var(--bg-tertiary)', border: `1px solid ${isAI ? 'rgba(5,150,105,0.25)' : 'var(--border-color)'}`, borderRadius: '5px', padding: '2px 7px' }}>
                {isAI ? 'AI MODE' : 'EVIDENCE MODE'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: 'auto' }}>{INTENT_LABEL[result.intent] || result.intent}</span>
            </div>
            <p style={{ fontSize: '15px', color: '#0a0a0a', lineHeight: 1.65, margin: 0 }}>{result.answer}</p>
            {result.aiError && (
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '10px 0 0' }}>AI unavailable · showing deterministic evidence</p>
            )}
          </div>

          {/* Evidence — only sections with real data */}
          {(ev.relationships || ev.impact || ev.runtime || ev.database || ctx.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={label}>Evidence</div>

              {/* Architecture (relationship chain) */}
              {ev.relationships && (ev.relationships.calledBy.length > 0 || ev.relationships.calls.length > 0) && (
                <EvidenceCard title="Architecture" action={primary ? { text: 'View in graph', on: () => onNavigate('architecture') } : undefined}>
                  <Chain calledBy={ev.relationships.calledBy} target={ev.relationships.target} calls={ev.relationships.calls} onPick={onOpenImpact} />
                </EvidenceCard>
              )}

              {/* Impact numbers */}
              {ev.impact && (
                <EvidenceCard title="Change impact" action={primary ? { text: 'View full impact report', on: () => onOpenImpact(primary.name) } : undefined}>
                  <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
                    <Metric n={ev.impact.totalAffectedNodes} l="affected nodes" />
                    <Metric n={ev.impact.endpoints.length} l="API endpoints" />
                    <Metric n={ev.impact.dbSchemas.length} l="DB dependencies" />
                    <Metric n={ev.impact.tests.length} l="tests" />
                  </div>
                </EvidenceCard>
              )}

              {/* Runtime */}
              {(ev.runtime || (ev.impact && ev.impact.endpoints.length > 0)) && (
                <EvidenceCard title="Runtime" action={{ text: 'View runtime', on: () => onNavigate('runtime') }}>
                  <RuntimeEvidence runtime={ev.runtime} endpoints={ev.impact?.endpoints} />
                </EvidenceCard>
              )}

              {/* Database */}
              {ev.database && ev.database.schemas.length > 0 && (
                <EvidenceCard title="Database">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {ev.database.schemas.map((s: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a' }}>
                        <Database size={14} style={{ color: '#059669' }} /> {s.name}
                        {s.touchedBy?.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'system-ui' }}>· touched by {s.touchedBy.slice(0, 3).join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                </EvidenceCard>
              )}

              {/* Context — HydraDB is background infrastructure, revealed on expand */}
              {ctx.length > 0 && (
                <EvidenceCard title="Context">
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {ctx.length} related engineering {ctx.length === 1 ? 'record' : 'records'} associated with <code>{primary?.name || result.question}</code>.
                    <button onClick={() => setShowContext((v) => !v)} style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#0a0a0a', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                      {showContext ? 'Hide' : 'View context'}
                    </button>
                  </div>
                  {showContext && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      {ctx.slice(0, 4).map((c: any, i: number) => (
                        <div key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px' }}>
                          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.content}</p>
                          <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '10.5px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                            <span>Source: HydraDB</span>
                            <span>{c.metadata?.filePath || c.metadata?.source_id || ''}</span>
                            <span>Relevance {(c.score ?? 0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </EvidenceCard>
              )}
            </div>
          )}

          {/* Follow-ups */}
          {result.followUps.length > 0 && (
            <div>
              <div style={{ ...label, marginBottom: '10px' }}>Follow up</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {result.followUps.map((f) => (
                  <button key={f} onClick={() => ask(f)} style={{ fontSize: '13px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0a0a0a')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}>{f}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function ResolutionLine({ primary, confidence, alternatives, onPick }: { primary: Light; confidence: number; alternatives: Light[]; onPick: (n: string) => void }) {
  const pct = Math.round(confidence * 100);
  // <50% → ask for clarification; 50–79% → show interpretation + alternatives; 80%+ → confident.
  if (confidence < 0.5 && alternatives.length > 0) {
    return (
      <div className="card" style={{ background: 'var(--bg-tertiary)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a', marginBottom: '4px' }}>TRACE found multiple possible matches</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Which did you mean?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {[primary, ...alternatives].map((a) => (
            <button key={a.id} onClick={() => onPick(a.name)} style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', background: '#ffffff', border: '1px solid var(--border-color)', color: '#0a0a0a', padding: '6px 10px', borderRadius: '7px', cursor: 'pointer' }}>{a.name}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <span>Interpreting as <code style={{ color: '#0a0a0a', fontWeight: 700 }}>{primary.name}</code> · confidence {pct}%</span>
      {confidence < 0.8 && alternatives.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-dim)' }}>change target:</span>
          {alternatives.map((a) => (
            <button key={a.id} onClick={() => onPick(a.name)} style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#0a0a0a', padding: '2px 7px', borderRadius: '5px', cursor: 'pointer' }}>{a.name}</button>
          ))}
        </span>
      )}
    </div>
  );
}

function EvidenceCard({ title, action, children }: { title: string; action?: { text: string; on: () => void }; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>{title}</span>
        {action && (
          <button className="btn" style={{ fontSize: '12px', padding: '5px 11px' }} onClick={action.on}>{action.text} <ArrowRight size={12} /></button>
        )}
      </div>
      {children}
    </div>
  );
}

function Chain({ calledBy, target, calls, onPick }: { calledBy: Light[]; target: Light; calls: Light[]; onPick: (n: string) => void }) {
  const node = (n: Light, strong?: boolean) => (
    <button onClick={() => onPick(n.name)} style={{ fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', fontWeight: strong ? 800 : 500, color: '#0a0a0a', background: strong ? 'var(--bg-tertiary)' : 'transparent', border: strong ? '1px solid #0a0a0a' : '1px solid var(--border-subtle)', borderRadius: '7px', padding: '6px 11px', cursor: 'pointer' }}>{n.name}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {calledBy.slice(0, 3).map((c) => <React.Fragment key={c.id}>{node(c)}<ArrowRight size={13} style={{ color: 'var(--text-dim)' }} /></React.Fragment>)}
      {node(target, true)}
      {calls.slice(0, 3).map((c) => <React.Fragment key={c.id}><ArrowRight size={13} style={{ color: 'var(--text-dim)' }} />{node(c)}</React.Fragment>)}
    </div>
  );
}

function RuntimeEvidence({ runtime, endpoints }: { runtime?: { observed: boolean; tracesRecorded: number; target: Light }; endpoints?: { name: string; status: string }[] }) {
  if (runtime) {
    return (
      <div>
        <span className={runtime.observed ? 'badge badge-verified' : 'badge badge-unobserved'}>● {runtime.observed ? 'VERIFIED' : 'UNOBSERVED'}</span>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
          {runtime.observed
            ? `A recorded execution contains ${runtime.target.name}.`
            : `TRACE has a static relationship for this path, but no recorded execution confirms it has run.`}
        </p>
      </div>
    );
  }
  const eps = (endpoints || []);
  const verified = eps.filter((e) => e.status === 'VERIFIED').length;
  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>{verified} of {eps.length} affected {eps.length === 1 ? 'route' : 'routes'} verified at runtime.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
        {[...eps].sort((a, b) => (a.status === b.status ? 0 : a.status === 'VERIFIED' ? -1 : 1)).slice(0, 40).map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0a0a0a' }}>{e.name}</span>
            <span className={e.status === 'VERIFIED' ? 'badge badge-verified' : 'badge badge-unobserved'}>● {e.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0a0a0a', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>{l}</div>
    </div>
  );
}
