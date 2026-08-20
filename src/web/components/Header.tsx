import React from 'react';
import { FolderGit2, BookOpen, Settings, Plus, Check, ChevronsUpDown } from 'lucide-react';
import { StorageModeInfo } from '../../core/hydradb/interface.js';
import { SymbolSearch } from './SymbolSearch.js';
import { GraphNode } from '../../core/hydradb/types.js';
import type { TabId } from './Sidebar.js';

interface RepoOption {
  repoName: string;
  repoPath: string;
  functions: number;
  endpoints: number;
}

interface HeaderProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  snapshotId: string;
  repoName?: string;
  storageModeInfo?: StorageModeInfo;
  onChangeRepoClick: () => void;
  onSwitchRepo?: (repoPath: string) => void;
  onSelectSymbol: (symbolNode: GraphNode) => void;
  onRefreshHydraPing?: () => void;
  onGoToLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  snapshotId,
  repoName = 'demo-app',
  storageModeInfo,
  onChangeRepoClick,
  onSwitchRepo,
  onSelectSymbol,
  onRefreshHydraPing,
  onGoToLanding,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [repos, setRepos] = React.useState<RepoOption[]>([]);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setRepos(d.repos || []))
      .catch(() => setRepos([]));
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);
  const isCloud = storageModeInfo?.mode === 'HydraDB Cloud';
  const status = storageModeInfo?.status || 'Offline';

  let badgeColor = '#059669';
  let statusText = 'HydraDB Connected';

  if (isCloud) {
    if (status === 'Connected') {
      badgeColor = '#059669';
      statusText = 'HydraDB Connected';
    } else if (status === 'Configured') {
      badgeColor = '#d97706';
      statusText = 'HydraDB Configured';
    } else {
      badgeColor = '#dc2626';
      statusText = 'HydraDB Offline';
    }
  } else {
    badgeColor = '#0a0a0a';
    statusText = 'HydraDB Local Engine';
  }

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      background: '#ffffff',
      borderBottom: '1px solid #e4e4e7',
      gap: '16px',
    }}>
      {/* Repo Switcher */}
      <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#09090b',
            background: menuOpen ? '#f0f0f2' : '#fafafa',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid #e4e4e7',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          <FolderGit2 size={15} style={{ color: '#71717a' }} />
          <span>{repoName || 'Select repository'}</span>
          <ChevronsUpDown size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              minWidth: '280px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              boxShadow: '0 12px 30px -8px rgba(0,0,0,0.18)',
              zIndex: 500,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-subtle)' }}>
              Analyzed repositories
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {repos.length === 0 ? (
                <div style={{ padding: '14px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>No repositories analyzed yet.</div>
              ) : (
                repos.map((r) => {
                  const active = r.repoName === repoName;
                  return (
                    <button
                      key={r.repoName}
                      onClick={() => {
                        setMenuOpen(false);
                        if (!active && onSwitchRepo) onSwitchRepo(r.repoPath);
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f8')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <FolderGit2 size={15} style={{ color: active ? '#0a0a0a' : '#a1a1aa', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repoName}</span>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{r.functions} symbols · {r.endpoints} endpoints</span>
                      </span>
                      {active && <Check size={15} style={{ color: '#0a0a0a', flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onChangeRepoClick();
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f8')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '11px 12px',
                border: 'none',
                borderTop: '1px solid var(--border-subtle)',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0a0a0a',
              }}
            >
              <Plus size={15} /> Analyze new project
            </button>
          </div>
        )}
      </div>

      {/* Global Symbol Search Bar */}
      <div style={{ flex: 1, maxWidth: '480px' }}>
        <SymbolSearch onSelectSymbol={onSelectSymbol} />
      </div>

      {/* Connection Badge & User Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          onClick={onRefreshHydraPing}
          style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#09090b',
            background: '#ffffff',
            padding: '4px 12px',
            borderRadius: '20px',
            border: '1px solid #e4e4e7',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: onRefreshHydraPing ? 'pointer' : 'default',
          }}
        >
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: badgeColor }} />
          <span>{statusText}</span>
        </div>

        <button onClick={onGoToLanding} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }} title="Landing Page">
          <BookOpen size={18} />
        </button>

        <button style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }} title="Settings">
          <Settings size={18} />
        </button>

        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: '#e4e4e7',
          color: '#09090b',
          fontWeight: '700',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          JD
        </div>
      </div>
    </header>
  );
};
