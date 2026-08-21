import React, { useEffect, useState } from 'react';
import {
  Search,
  Send,
  X,
  Zap,
  Code2,
  Globe,
  Database,
  Beaker,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  FileText,
  Layers,
  Sparkles,
  Info,
  Clock,
  ExternalLink,
} from 'lucide-react';
import type { TabId } from './Sidebar.js';
import { usePaged, Pager } from './Pager.js';

interface AskTraceProps {
  activeRepoName?: string;
  onOpenImpact: (symbolName: string) => void;
  onNavigate: (tab: TabId) => void;
}

interface Light {
  id: string;
  name: string;
  type: string;
  filePath?: string;
}

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

const EXAMPLE_PROMPTS = [
  'How does checkout depend on tax calculation?',
  'What code is related to invoice generation?',
  'Find context about database writes?',
  'What changed around calculateTax?',
];

export const AskTrace: React.FC<AskTraceProps> = ({ activeRepoName, onOpenImpact, onNavigate }) => {
  const [question, setQuestion] = useState('What could break if I change calculateTax?');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setQuestion(query);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ask failed');
      setResult(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run initial query on mount so page matches reference layout out-of-the-box
  useEffect(() => {
    ask('What could break if I change calculateTax?');
  }, []);

  const ev = result?.evidence || {};
  const primary = result?.resolvedTargets?.[0];
  const targetName = primary?.name || '';
  const hydraContext = (ev.hydraContext || []) as any[];
  const isAI = result?.answerMode === 'ai';

  // Real evidence values only — never fabricated. Zero when absent.
  const affectedCount = ev.impact?.totalAffectedNodes ?? 0;
  const apiCount = ev.impact?.endpoints?.length ?? 0;
  const dbCount = ev.impact?.dbSchemas?.length ?? 0;
  const testCount = ev.impact?.tests?.length ?? 0;
  const endpoints = (ev.impact?.endpoints || []) as { name: string; status: string; traceCount: number }[];
  const sortedEndpoints = [...endpoints].sort((a, b) => (a.status === b.status ? 0 : a.status === 'VERIFIED' ? -1 : 1));
  const epPage = usePaged(sortedEndpoints, 5);
  const ctxPage = usePaged(hydraContext, 5);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Page Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.02em' }}>
          Ask TRACE
        </h1>
        <p style={{ color: '#71717a', fontSize: '14px', margin: '4px 0 0 0' }}>
          Ask anything about your codebase. TRACE uses static analysis, runtime data, and HydraDB context to answer.
        </p>
      </div>

      {/* 2. Main Search / Prompt Box */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            position: 'relative',
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <Search size={20} style={{ color: '#71717a', marginRight: '14px', flexShrink: 0 }} />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(question)}
            placeholder="What could break if I change calculateTax?"
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '15px',
              fontWeight: '600',
              fontFamily: 'JetBrains Mono, monospace',
              color: '#09090b',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
            {question && (
              <button
                onClick={() => setQuestion('')}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', padding: '4px' }}
              >
                <X size={18} />
              </button>
            )}
            <button
              onClick={() => ask(question)}
              disabled={loading}
              style={{
                background: '#000000',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Example Prompt Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ color: '#71717a' }}>Try one of these examples:</span>
          {EXAMPLE_PROMPTS.map((promptText, idx) => (
            <button
              key={idx}
              onClick={() => ask(promptText)}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                color: '#09090b',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              {promptText}
            </button>
          ))}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#71717a' }}>
          TRACE is analyzing AST graph, checking runtime traces and recalling HydraDB context...
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* 3. Main 2-Column Content Grid */}
      {result && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
            {/* Answer Box */}
            <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#09090b', margin: 0 }}>{isAI ? 'AI Explanation' : 'Answer'}</h3>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: isAI ? '#047857' : '#71717a', background: isAI ? '#ecfdf5' : '#f4f4f5', border: `1px solid ${isAI ? '#a7f3d0' : '#e4e4e7'}`, padding: '2px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={12} /> {isAI ? 'AI mode' : 'Evidence mode'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{result.intent.replace(/_/g, ' ')}</div>
              </div>

              {/* Answer text — the real grounded answer from /api/ask */}
              <div style={{ fontSize: '14px', color: '#09090b', lineHeight: '1.65' }}>
                <p style={{ margin: 0 }}>{result.answer}</p>
                {result.aiError && <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#a1a1aa' }}>AI unavailable · showing deterministic evidence</p>}
              </div>

              {/* Summary 4 KPI Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '12px' }}>
                  <Code2 size={16} style={{ color: '#09090b', marginBottom: '6px' }} />
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#09090b' }}>{affectedCount}</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>Affected symbols</div>
                </div>

                <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '12px' }}>
                  <Globe size={16} style={{ color: '#09090b', marginBottom: '6px' }} />
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#09090b' }}>{apiCount}</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>API endpoints</div>
                </div>

                <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '12px' }}>
                  <Database size={16} style={{ color: '#09090b', marginBottom: '6px' }} />
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#09090b' }}>{dbCount}</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>Database</div>
                </div>

                <div style={{ background: '#f4f4f5', borderRadius: '10px', padding: '12px' }}>
                  <Beaker size={16} style={{ color: '#09090b', marginBottom: '6px' }} />
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#09090b' }}>{testCount}</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>Relevant tests</div>
                </div>
              </div>

              {/* Runtime Evidence — real endpoints from the response (verified first) */}
              {(sortedEndpoints.length > 0 || ev.runtime) && (
                <div style={{ borderTop: '1px solid #f4f4f5', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>Runtime evidence</div>

                  {ev.runtime && sortedEndpoints.length === 0 && (
                    <div style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: ev.runtime.observed ? '#10b981' : '#d97706', background: ev.runtime.observed ? '#ecfdf5' : '#fffbe8', padding: '2px 6px', borderRadius: '4px' }}>
                        {ev.runtime.observed ? '✓ VERIFIED' : '⚠ UNOBSERVED'}
                      </span>
                      <div style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', color: '#09090b' }}>{ev.runtime.target.name}</div>
                    </div>
                  )}

                  {epPage.pageItems.map((ep, i) => {
                    const verified = ep.status === 'VERIFIED';
                    return (
                      <div key={i} style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', color: verified ? '#10b981' : '#d97706', background: verified ? '#ecfdf5' : '#fffbe8', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                            {verified ? '✓ VERIFIED' : '⚠ UNOBSERVED'}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', color: '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</div>
                            <div style={{ fontSize: '11px', color: '#71717a' }}>
                              {verified ? `Observed in ${ep.traceCount} recorded ${ep.traceCount === 1 ? 'trace' : 'traces'}` : 'Reachable in static graph but not seen in runtime'}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => onNavigate('runtime')} style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: '#09090b', fontWeight: '500', cursor: 'pointer', flexShrink: 0 }}>
                          {verified ? 'View trace' : 'View path'}
                        </button>
                      </div>
                    );
                  })}
                  <Pager page={epPage.page} totalPages={epPage.totalPages} setPage={epPage.setPage} total={epPage.total} label="routes" />
                </div>
              )}

              {/* What Could Be Affected Category Accordion List */}
              <div style={{ borderTop: '1px solid #f4f4f5', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>What could be affected</div>

                <div style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onOpenImpact(targetName)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Code2 size={16} style={{ color: '#09090b' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>Functions</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Directly or indirectly affected</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
                    <span>{affectedCount}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onOpenImpact(targetName)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Globe size={16} style={{ color: '#09090b' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>API endpoints</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>HTTP routes that may be impacted</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
                    <span>{apiCount}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onOpenImpact(targetName)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Database size={16} style={{ color: '#09090b' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>Database</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Tables/queries that could be affected</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
                    <span>{dbCount}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div style={{ border: '1px solid #f4f4f5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onOpenImpact(targetName)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Beaker size={16} style={{ color: '#09090b' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#09090b' }}>Tests</div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Relevant tests to run</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
                    <span>{testCount}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>

              {/* Card Footer Link */}
              <button
                onClick={() => onOpenImpact(targetName)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#09090b',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                  marginTop: '4px',
                }}
              >
                View full impact report →
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Right Card: Related context */}
            <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#09090b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={16} style={{ color: '#09090b' }} />
                  Related context
                </h3>
                <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
                  Context from HydraDB relevant to your question.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {hydraContext.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#a1a1aa' }}>No related context found for this question.</div>
                ) : (
                  ctxPage.pageItems.map((c: any, i: number) => (
                    <div key={i} style={{ border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', gap: '8px' }}>
                        <div style={{ fontWeight: '700', color: '#09090b', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.metadata?.filePath || c.metadata?.source_id || 'context'}
                        </div>
                        <span style={{ fontSize: '11px', color: '#10b981', background: '#ecfdf5', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 }}>{(c.score ?? 0).toFixed(2)}</span>
                      </div>
                      <div style={{ color: '#52525b', fontSize: '11px', marginTop: '4px', lineHeight: 1.5 }}>{c.content}</div>
                    </div>
                  ))
                )}
                <Pager page={ctxPage.page} totalPages={ctxPage.totalPages} setPage={ctxPage.setPage} total={ctxPage.total} label="records" />
              </div>

              <button
                onClick={() => onNavigate('hydra')}
                style={{ background: 'transparent', border: 'none', fontSize: '12px', color: '#09090b', fontWeight: '700', cursor: 'pointer', textAlign: 'right', marginTop: '4px' }}
              >
                View all context →
              </button>
            </div>

            {/* Bottom Right Card: Evidence sources */}
            <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#09090b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} style={{ color: '#09090b' }} />
                  Evidence sources
                </h3>
                <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
                  Where this answer came from.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#09090b' }}>Static analysis</div>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>Dependency graph, AST, symbol resolution</div>
                  </div>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#09090b' }}>Runtime traces</div>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>Execution spans, verified paths</div>
                  </div>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#09090b' }}>HydraDB context</div>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>Semantic search, code knowledge base</div>
                  </div>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#09090b' }}>Git context</div>
                    <div style={{ fontSize: '11px', color: '#71717a' }}>Current branch, recent changes</div>
                  </div>
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Page Footer Disclaimer Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e4e4e7', paddingTop: '16px', fontSize: '12px', color: '#71717a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={14} />
          <span>Answers are based on data from your repository. TRACE does not modify your code.</span>
        </div>
        <a href="https://github.com/mzterwalexzyy/trace" target="_blank" rel="noreferrer" style={{ color: '#71717a', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Learn how Ask TRACE works <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
};
