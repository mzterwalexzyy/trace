import React, { useEffect, useState } from 'react';
import { FolderGit2, GitBranch, Boxes, Network, Database, ShieldAlert, ArrowRight, RefreshCw, Cloud, HardDrive } from 'lucide-react';
import type { TabId } from './Sidebar.js';
import { usePaged, Pager } from './Pager.js';

interface RepoCard {
  repoName: string;
  repoPath: string;
  branch: string;
  snapshotId: string;
  functions: number;
  endpoints: number;
  files: number;
  dbSchemas: number;
  tests: number;
  nodeCount: number;
  edgeCount: number;
  startedAt: string;
  source: 'local' | 'git';
}

interface RepositoryViewProps {
  activeRepoName: string;
  onConnectRepo: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onNavigate: (tab: TabId) => void;
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

const stat: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px' };
const statNum: React.CSSProperties = { fontSize: '18px', fontWeight: 800, color: '#0a0a0a', lineHeight: 1 };
const statLbl: React.CSSProperties = { fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' };

export const RepositoryView: React.FC<RepositoryViewProps> = ({ activeRepoName, onConnectRepo, onSwitchRepo, onNavigate }) => {
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const reposPage = usePaged(repos, 5);

  const load = () => {
    setLoading(true);
    fetch('/api/dashboard?repo=all')
      .then((r) => r.json())
      .then((d) => setRepos(d.repos || []))
      .catch((err) => console.error('Failed to load repositories:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeRepoName]);

  const open = (repo: RepoCard, tab: TabId) => {
    if (repo.repoName !== activeRepoName && repo.repoPath) onSwitchRepo(repo.repoPath);
    onNavigate(tab);
  };

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0a0a' }}>Repositories</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Every repository TRACE has analyzed, with its latest snapshot and stats.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
          <button className="btn btn-primary" onClick={onConnectRepo}><FolderGit2 size={14} /> Analyze repository</button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
      ) : repos.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0a0a0a', marginBottom: '6px' }}>No repositories analyzed yet</div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>Analyze a local folder or paste a Git URL to build its first snapshot.</p>
          <button className="btn btn-primary" onClick={onConnectRepo} style={{ margin: '0 auto' }}><FolderGit2 size={14} /> Analyze a repository</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {reposPage.pageItems.map((repo) => {
            const isActive = repo.repoName === activeRepoName;
            return (
              <div
                key={repo.repoName}
                className="card"
                style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderColor: isActive ? '#0a0a0a' : 'var(--border-color)' }}
              >
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', flexShrink: 0 }}>
                      <FolderGit2 size={17} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.repoName}</span>
                        {isActive && <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', color: '#ffffff', background: '#0a0a0a', borderRadius: '4px', padding: '2px 6px' }}>ACTIVE</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {repo.source === 'git' ? <Cloud size={11} /> : <HardDrive size={11} />} {repo.source}
                        </span>
                        <span>·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GitBranch size={11} /> {repo.branch}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', flex: 1 }}>
                  <div style={stat}><span style={statNum}>{repo.files}</span><span style={statLbl}>Files</span></div>
                  <div style={stat}><span style={statNum}>{repo.functions}</span><span style={statLbl}><Boxes size={11} /> Symbols</span></div>
                  <div style={stat}><span style={statNum}>{repo.endpoints}</span><span style={statLbl}><Network size={11} /> APIs</span></div>
                  <div style={stat}><span style={statNum}>{repo.dbSchemas}</span><span style={statLbl}><Database size={11} /> Schemas</span></div>
                </div>

                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }} title={repo.snapshotId}>
                    {repo.snapshotId?.slice(0, 12)} · {relativeTime(repo.startedAt)}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => open(repo, 'impact')} title="Change Impact">
                      <ShieldAlert size={13} />
                    </button>
                    <button className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => open(repo, 'architecture')}>
                      Open <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ gridColumn: '1 / -1' }}>
            <Pager page={reposPage.page} totalPages={reposPage.totalPages} setPage={reposPage.setPage} total={reposPage.total} label="repositories" />
          </div>
        </div>
      )}
    </div>
  );
};
