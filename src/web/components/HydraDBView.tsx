import React, { useEffect, useState } from 'react';
import { Database, Search, Loader2, Cloud, HardDrive, FileCode, Boxes } from 'lucide-react';
import { usePaged, Pager } from './Pager.js';

interface Overview {
  storageMode: { mode: string; status: string; isConnected: boolean; database: string; sdkPackage: string; lastVerifiedAt?: string };
  snapshotId: string;
  repoName: string;
  repoPath: string;
  commitSha: string;
  graph: { nodes: number; edges: number };
  ingestedContextDocs: number;
}

interface QueryResult {
  content: string;
  score: number;
  metadata?: { filePath?: string; source_id?: string; symbolType?: string };
}

const label: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' };

export const HydraDBView: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [querying, setQuerying] = useState(false);
  const resultsPage = usePaged(results || [], 5);

  useEffect(() => {
    fetch('/api/hydra/overview').then((r) => r.json()).then(setOverview).catch(() => {});
  }, []);

  const runQuery = async () => {
    if (!query.trim()) return;
    setQuerying(true);
    try {
      const r = await fetch('/api/hydra/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) });
      const d = await r.json();
      setResults(d.results || []);
    } catch {
      setResults([]);
    } finally {
      setQuerying(false);
    }
  };

  const sm = overview?.storageMode;
  const connected = sm?.status === 'Connected';
  const statusColor = connected ? 'var(--status-verified)' : sm?.status === 'Configured' ? 'var(--status-unobserved)' : 'var(--text-dim)';
  const isCloud = sm?.mode === 'HydraDB Cloud';

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a' }}>
          <Database size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a', margin: 0 }}>HydraDB</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '2px 0 0' }}>The cloud context layer powering TRACE's intelligence.</p>
        </div>
      </div>

      {/* Connection + metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', margin: '22px 0' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={label}>Connection</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isCloud ? <Cloud size={18} style={{ color: statusColor }} /> : <HardDrive size={18} style={{ color: statusColor }} />}
            <span style={{ fontSize: '18px', fontWeight: 800, color: statusColor }}>{sm?.status || '—'}</span>
          </div>
          <Row k="Mode" v={sm?.mode || '—'} />
          <Row k="Database" v={sm?.database || '—'} mono />
          <Row k="SDK" v={sm?.sdkPackage || '—'} mono />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={label}>Snapshot</span>
          <Row k="Repository" v={overview?.repoName || '—'} />
          <Row k="Commit" v={overview?.commitSha || '—'} mono />
          <Row k="Snapshot" v={overview?.snapshotId ? overview.snapshotId.slice(0, 16) : '—'} mono />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={label}>Ingested to HydraDB</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Boxes size={18} style={{ color: '#0a0a0a' }} />
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0a0a0a' }}>{overview?.ingestedContextDocs ?? 0}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>context documents</span>
          </div>
          <Row k="Graph nodes" v={String(overview?.graph.nodes ?? 0)} />
          <Row k="Graph edges" v={String(overview?.graph.edges ?? 0)} />
        </div>
      </div>

      {/* Query */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <span style={label}>Query project context</span>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Retrieve the most relevant code context TRACE has stored for this repository, straight from HydraDB.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runQuery()}
              placeholder="e.g. tax calculation, checkout flow, order schema…"
              style={{ width: '100%', padding: '10px 12px 10px 38px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <button className="btn btn-primary" onClick={runQuery} disabled={querying} style={{ padding: '10px 18px' }}>
            {querying ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Query
          </button>
        </div>

        {results && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {results.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No context found for that query.</div>
            ) : (
              <>
                {resultsPage.pageItems.map((r, i) => (
                  <div key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: '#71717a', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <FileCode size={12} /> {r.metadata?.filePath || r.metadata?.source_id || 'HydraDB'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Relevance {r.score.toFixed(2)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.content}</p>
                  </div>
                ))}
                <Pager page={resultsPage.page} totalPages={resultsPage.totalPages} setPage={resultsPage.setPage} total={resultsPage.total} label="results" />
              </>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '760px' }}>
        TRACE does the deterministic engineering analysis locally — AST parsing, the exact dependency graph, blast-radius traversal and the VERIFIED / UNOBSERVED runtime intersection. HydraDB is the cloud context layer: TRACE ingests a document per symbol and retrieves the most relevant ones to enrich impact reports. TRACE does not run graph traversals or Cypher inside HydraDB.
      </p>
    </div>
  );
};

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontSize: mono ? '12px' : '13px', fontWeight: 600, color: '#0a0a0a', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
    </div>
  );
}
