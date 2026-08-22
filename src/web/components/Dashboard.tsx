import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  FunctionSquare,
  Network,
  ShieldCheck,
  Cloud,
  ArrowRight,
  RefreshCw,
  FolderGit2,
  Database,
  Search,
  TerminalSquare,
  ChevronsUpDown,
} from 'lucide-react';
import type { TabId } from './Sidebar.js';
import { usePaged, Pager } from './Pager.js';

interface RunSummary {
  id: string;
  repoName: string;
  repoPath: string;
  branch: string;
  snapshotId: string;
  status: string;
  startedAt: string;
  functions: number;
  endpoints: number;
  files: number;
  nodeCount: number;
}

interface DashboardData {
  scope: string;
  repos: { repoName: string; repoPath: string; branch: string; snapshotId: string; functions: number; endpoints: number; files: number }[];
  totals: { reposEvaluated: number; totalAnalyses: number; symbols: number; endpoints: number; files: number; dbSchemas: number; tests: number };
  runtime: { coverage: number; verifiedEndpoints: number; totalEndpoints: number; tracesRecorded: number; activeRepo: string };
  recentRuns: RunSummary[];
  history: { startedAt: string; symbols: number; endpoints: number; files: number; nodes: number }[];
  topRepos: { repoName: string; repoPath: string; symbols: number; endpoints: number; files: number }[];
  hydra: { mode: string; status: string; database: string; sdkPackage: string; lastVerifiedAt?: string };
  graph: { nodes: number; edges: number; snapshotId: string };
}

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
  onConnectRepo: () => void;
  onSwitchRepo?: (repoPath: string) => void;
  activeRepoName?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const m = Math.floor((Date.now() - then) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const uc: React.CSSProperties = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' };

// A tiny inline sparkline built from a real numeric series.
function Sparkline({ series, color = '#0a0a0a', w = 96, h = 30 }: { series: number[]; color?: string; w?: number; h?: number }) {
  if (series.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r={2.2} fill={color} />
    </svg>
  );
}

function StatCard({ icon, name, value, foot, series, seriesColor }: { icon: React.ReactNode; name: string; value: React.ReactNode; foot?: React.ReactNode; series?: number[]; seriesColor?: string }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex', width: '28px', height: '28px', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>{icon}</span>
        <span style={uc}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a', lineHeight: 1 }}>{value}</div>
        {series && series.length > 1 && <Sparkline series={series} color={seriesColor || '#0a0a0a'} />}
      </div>
      {foot && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{foot}</div>}
    </div>
  );
}

// Multi-series line chart (real data) — symbols / endpoints / files over runs.
// Interactive: hovering shows a guide line + tooltip with each series value.
function TrendChart({ history }: { history: DashboardData['history'] }) {
  const w = 560;
  const h = 220;
  const padL = 34;
  const padB = 26;
  const padT = 12;
  const padR = 12;
  const [hover, setHover] = useState<number | null>(null);
  const series = [
    { key: 'symbols' as const, label: 'Symbols', color: '#0a0a0a' },
    { key: 'files' as const, label: 'Files', color: '#059669' },
    { key: 'endpoints' as const, label: 'Endpoints', color: '#d97706' },
  ];
  const all = history.flatMap((p) => [p.symbols, p.files, p.endpoints]);
  const max = Math.max(1, ...all);
  const n = history.length;
  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const yAt = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  };

  const hp = hover != null ? history[hover] : null;
  const tipLeftPct = hover != null ? (xAt(hover) / w) * 100 : 0;
  const tipRight = tipLeftPct > 60;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={w} height={h} style={{ display: 'block', minWidth: '100%' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => {
          const y = padT + f * (h - padT - padB);
          return <line key={f} x1={padL} y1={y} x2={w - padR} y2={y} stroke="var(--border-subtle)" strokeWidth={1} />;
        })}
        {[max, Math.round(max / 2), 0].map((v, i) => (
          <text key={i} x={padL - 6} y={padT + (i / 2) * (h - padT - padB) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" fontFamily="JetBrains Mono, monospace">{v}</text>
        ))}
        {hover != null && (
          <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={h - padB} stroke="var(--border-color)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {series.map((s) => {
          const pts = history.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p[s.key]).toFixed(1)}`).join(' ');
          return (
            <g key={s.key}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" />
              {history.map((p, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(p[s.key])} r={hover === i ? 4 : 2.4} fill={s.color} stroke={hover === i ? '#ffffff' : 'none'} strokeWidth={hover === i ? 1.5 : 0} />
              ))}
            </g>
          );
        })}
      </svg>
      {hp && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            [tipRight ? 'right' : 'left']: tipRight ? `${100 - tipLeftPct}%` : `${tipLeftPct}%`,
            transform: tipRight ? 'translateX(-8px)' : 'translateX(8px)',
            background: '#0a0a0a',
            color: '#ffffff',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '11px',
            pointerEvents: 'none',
            zIndex: 5,
            minWidth: '120px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#a1a1aa', marginBottom: '5px' }}>{relativeTime(hp.startedAt)}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, display: 'inline-block' }} />
                {s.label}
              </span>
              <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{hp[s.key]}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '16px', padding: '4px 0 0 34px' }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ width: '16px', height: '2px', background: s.color, display: 'inline-block' }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onConnectRepo, onSwitchRepo, activeRepoName }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [scope, setScope] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [q, setQ] = useState<string>('');

  const load = (s: string) => {
    setLoading(true);
    fetch(`/api/dashboard?repo=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((err) => console.error('Failed to load dashboard:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const t = data?.totals;
  const rt = data?.runtime;
  const hydra = data?.hydra;
  const connected = hydra?.status === 'Connected';
  const hydraColor = connected ? 'var(--status-verified)' : hydra?.status === 'Configured' ? 'var(--status-unobserved)' : 'var(--text-dim)';
  const symbolSeries = useMemo(() => (data?.history || []).map((p) => p.symbols), [data]);
  const fileSeries = useMemo(() => (data?.history || []).map((p) => p.files), [data]);

  const empty = !loading && (t?.reposEvaluated ?? 0) === 0;
  const query = q.trim().toLowerCase();
  const filteredRuns = (data?.recentRuns || []).filter((r) => !query || r.repoName.toLowerCase().includes(query));
  const runsPage = usePaged(filteredRuns, 5);
  const filteredTop = (data?.topRepos || []).filter((r) => !query || r.repoName.toLowerCase().includes(query));

  const openRepo = (repoPath: string, repoName: string) => {
    if (repoName !== activeRepoName && onSwitchRepo && repoPath) onSwitchRepo(repoPath);
    onNavigate('architecture');
  };

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a' }}>Dashboard</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>Overview of your codebases and engineering intelligence.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 34px 9px 12px', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
            >
              <option value="all">All repositories</option>
              {data?.repos.map((r) => <option key={r.repoName} value={r.repoName}>{r.repoName}</option>)}
            </select>
            <ChevronsUpDown size={14} style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
          </div>
          <button className="btn" onClick={() => load(scope)} title="Refresh"><RefreshCw size={14} /></button>
          <button className="btn btn-primary" onClick={onConnectRepo}><TerminalSquare size={15} /> Analyze repository</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search repositories…"
          style={{ width: '100%', padding: '12px 14px 12px 40px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', color: 'var(--text-main)' }}
        />
      </div>

      {empty ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0a0a0a', marginBottom: '6px' }}>No repositories analyzed yet</div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>Analyze a repository to build its static graph, record runtime traces, and populate this dashboard.</p>
          <button className="btn btn-primary" onClick={onConnectRepo} style={{ margin: '0 auto' }}><FolderGit2 size={14} /> Analyze a repository</button>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
            <StatCard icon={<Boxes size={16} />} name="Repositories" value={t?.reposEvaluated ?? '—'} foot={`${t?.totalAnalyses ?? 0} total analyses`} />
            <StatCard icon={<FunctionSquare size={16} />} name="Symbols" value={t?.symbols ?? '—'} foot={`${t?.files ?? 0} files parsed`} series={symbolSeries} seriesColor="#0a0a0a" />
            <StatCard icon={<Network size={16} />} name="API Endpoints" value={t?.endpoints ?? '—'} foot={`${t?.dbSchemas ?? 0} DB schemas`} series={fileSeries} seriesColor="#059669" />
            <StatCard icon={<ShieldCheck size={16} />} name="Runtime Coverage" value={`${rt?.coverage ?? 0}%`} foot={`${rt?.verifiedEndpoints ?? 0}/${rt?.totalEndpoints ?? 0} endpoints verified`} />
            <StatCard icon={<Cloud size={16} />} name="HydraDB" value={<span style={{ fontSize: '20px', color: hydraColor }}>{hydra?.status ?? '—'}</span>} foot={hydra?.mode ?? ''} />
          </div>

          {/* Recent runs + trend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px', alignItems: 'stretch' }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>Recent evaluation runs</span>
                <span style={uc}>{filteredRuns.length} total</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-dim)' }}>
                      {['Repository', 'Branch', 'Snapshot', 'Symbols', 'Endpoints', 'Status', 'When'].map((hd) => (
                        <th key={hd} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)' }}>{hd}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runsPage.pageItems.map((run) => (
                      <tr key={run.id} onClick={() => openRepo(run.repoPath, run.repoName)} title={`Open ${run.repoName} in Architecture`} style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: '#0a0a0a' }}>{run.repoName}</td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>⎇ {run.branch}</td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{run.snapshotId?.slice(0, 12)}</td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>{run.functions}</td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>{run.endpoints}</td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)' }}><span className="badge badge-verified">{run.status}</span></td>
                        <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>{relativeTime(run.startedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0 18px 14px' }}>
                <Pager page={runsPage.page} totalPages={runsPage.totalPages} setPage={runsPage.setPage} total={runsPage.total} label="runs" />
              </div>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>Analysis trend</span>
                <span style={uc}>{(data?.history || []).length} runs</span>
              </div>
              {(data?.history || []).length < 2 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Analyze a few times to see a trend across snapshots.</div>
              ) : (
                <TrendChart history={data!.history} />
              )}
            </div>
          </div>

          {/* Top repositories + intelligence */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px', alignItems: 'start' }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>Top repositories by size</span>
                {filteredTop.length > 4 && (
                  <button onClick={() => onNavigate('repository')} style={{ fontSize: '12px', fontWeight: 600, color: '#0a0a0a', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Show all <ArrowRight size={13} />
                  </button>
                )}
              </div>
              <div style={{ padding: '6px 0' }}>
                {filteredTop.slice(0, 4).map((r) => {
                  const maxSym = Math.max(1, ...(data?.topRepos || []).map((x) => x.symbols));
                  return (
                    <button key={r.repoName} onClick={() => openRepo(r.repoPath, r.repoName)} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', padding: '10px 18px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a', width: '130px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repoName}</span>
                      <span style={{ flex: 1, height: '7px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(r.symbols / maxSym) * 100}%`, background: '#0a0a0a', borderRadius: '4px' }} />
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '90px', textAlign: 'right', flexShrink: 0 }}>{r.symbols} symbols</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>Intelligence layer</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: hydraColor }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: hydraColor }} /> {hydra?.status ?? '—'}
                </span>
              </div>
              <Row k="Storage mode" v={hydra?.mode ?? '—'} />
              <Row k="Database" v={hydra?.database ?? '—'} mono />
              <Row k="SDK" v={hydra?.sdkPackage ?? '—'} mono />
              <Row k="Graph nodes" v={String(data?.graph.nodes ?? 0)} />
              <Row k="Graph edges" v={String(data?.graph.edges ?? 0)} />
              <Row k="Runtime traces" v={String(rt?.tracesRecorded ?? 0)} />
            </div>
          </div>

          {/* HydraDB status bar */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap', padding: '16px 20px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <Database size={18} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a' }}>HydraDB status</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: hydraColor }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: hydraColor }} /> {hydra?.status ?? '—'}
              </span>
            </span>
            <StatInline k="Graph nodes" v={data?.graph.nodes ?? 0} />
            <StatInline k="Graph edges" v={data?.graph.edges ?? 0} />
            <StatInline k="Snapshot" v={data?.graph.snapshotId ? data.graph.snapshotId.slice(0, 12) : '—'} mono />
            <span style={{ marginLeft: 'auto' }}>
              <button className="btn" onClick={() => onNavigate('architecture')}>Open Architecture <ArrowRight size={14} /></button>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

function StatInline({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '15px', fontWeight: 800, color: '#0a0a0a', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>{v}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{k}</span>
    </span>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontSize: mono ? '12px' : '13px', fontWeight: 600, color: '#0a0a0a', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
