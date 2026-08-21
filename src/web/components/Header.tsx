import React from 'react';
import { FolderGit2, BookOpen, Settings, Plus, Check, ChevronsUpDown, Menu } from 'lucide-react';
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
  onToggleMobileMenu?: () => void;
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
  onToggleMobileMenu,
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
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#ffffff',
        borderBottom: '1px solid #e4e4e7',
        gap: '12px',
        flexWrap: 'wrap',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Left section: Mobile Hamburger + Repo Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            title="Open Menu"
            style={{
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              padding: '7px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#09090b',
            }}
          >
            <Menu size={18} />
          </button>
        )}

        {/* Repo Switcher Dropdown */}
        <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#09090b',
              background: menuOpen ? '#f0f0f2' : '#fafafa',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #e4e4e7',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              maxWidth: '160px',
            }}
          >
            <FolderGit2 size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repoName}</span>
            <ChevronsUpDown size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: '260px',
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '6px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-dim)', padding: '6px 8px 4px' }}>
                Select repository
              </div>
              {repos.length === 0 ? (
                <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading repositories...</div>
              ) : (
                repos.map((r) => {
                  const selected = r.repoName === repoName;
                  return (
                    <button
                      key={r.repoPath}
                      onClick={() => {
                        setMenuOpen(false);
                        if (onSwitchRepo) onSwitchRepo(r.repoPath);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selected ? '#f2f2f3' : 'transparent',
                        color: '#0a0a0a',
                        fontSize: '12.5px',
                        fontWeight: selected ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repoName}</span>
                      {selected && <Check size={14} style={{ color: '#059669', flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}
              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onChangeRepoClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#0a0a0a',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <Plus size={14} /> Connect another repository
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Middle: Global Symbol Search */}
      <div style={{ flex: '1 1 220px', maxWidth: '420px', minWidth: '160px' }}>
        <SymbolSearch onSelectSymbol={onSelectSymbol} />
      </div>

      {/* Right section: HydraDB Status & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div
          onClick={onRefreshHydraPing}
          title={`${statusText} — click to re-ping`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#09090b',
            cursor: 'pointer',
          }}
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: badgeColor, flexShrink: 0 }} />
          <span style={{ display: 'inline-block' }}>{statusText}</span>
        </div>
      </div>
    </header>
  );
};
