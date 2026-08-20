import React, { useRef, useState } from 'react';
import { LayoutDashboard, Layers, ShieldAlert, Activity, FolderGit2, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';

export type TabId = 'dashboard' | 'ask' | 'impact' | 'architecture' | 'runtime' | 'repository' | 'hydra';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  repoName: string;
  snapshotId: string;
  onChangeRepoClick: () => void;
  onGoToLanding: () => void;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
      { id: 'ask', label: 'Ask TRACE', icon: <Sparkles size={16} /> },
    ],
  },
  {
    heading: 'Understand',
    items: [
      { id: 'architecture', label: 'Architecture', icon: <Layers size={16} /> },
      { id: 'repository', label: 'Repository', icon: <FolderGit2 size={16} /> },
    ],
  },
  {
    heading: 'Analyze',
    items: [
      { id: 'impact', label: 'Change Impact', icon: <ShieldAlert size={16} /> },
      { id: 'runtime', label: 'Runtime Traces', icon: <Activity size={16} /> },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  repoName,
  snapshotId,
  onChangeRepoClick,
  onGoToLanding,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  // Auto-collapse 5s after the mouse leaves; expand instantly on hover. A manual
  // toggle still works and simply pre-empts the timer.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <aside
      onMouseEnter={() => {
        clearTimer();
        setCollapsed(false);
      }}
      onMouseLeave={() => {
        clearTimer();
        timerRef.current = setTimeout(() => setCollapsed(true), 5000);
      }}
      style={{
        width: collapsed ? '64px' : '244px',
        background: '#ffffff',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: collapsed ? '18px 10px' : '18px 14px',
        color: 'var(--text-main)',
        flexShrink: 0,
        minHeight: '100vh',
        transition: 'width 0.16s ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* Brand + collapse toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '2px' : '2px 8px' }}>
          <div
            onClick={onGoToLanding}
            title="TRACE — home"
            style={{
              width: '22px',
              height: '22px',
              background: '#0a0a0a',
              clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
          {!collapsed && (
            <span onClick={onGoToLanding} style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.03em', color: '#0a0a0a', cursor: 'pointer' }}>
              TRACE
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              marginLeft: collapsed ? 0 : 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              padding: '2px',
            }}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        {/* Grouped nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? '10px' : '18px' }}>
          {GROUPS.map((group, gi) => (
            <div key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {!collapsed ? (
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    padding: '0 10px 6px',
                  }}
                >
                  {group.heading}
                </div>
              ) : (
                gi > 0 && <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0 6px 6px' }} />
              )}
              {group.items.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={collapsed ? item.label : undefined}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = '#f7f7f8';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: '11px',
                      padding: collapsed ? '10px 0' : '9px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: active ? '#f2f2f3' : 'transparent',
                      color: active ? '#0a0a0a' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 500,
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <span style={{ display: 'flex', color: active ? '#0a0a0a' : 'var(--text-dim)' }}>{item.icon}</span>
                    {!collapsed && item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom repository card */}
      {collapsed ? (
        <button
          onClick={onChangeRepoClick}
          title={`${repoName || 'repository'} — change repository`}
          style={{
            background: '#f7f7f8',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '10px 0',
            display: 'flex',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#0a0a0a',
          }}
        >
          <FolderGit2 size={17} />
        </button>
      ) : (
        <div
          style={{
            background: '#f7f7f8',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Repository
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a' }}>{repoName}</div>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⎇ main</span>
            <span>•</span>
            <span>{snapshotId ? snapshotId.slice(0, 12) : 'no snapshot'}</span>
          </div>
          <button
            onClick={onChangeRepoClick}
            style={{
              marginTop: '4px',
              alignSelf: 'flex-start',
              fontSize: '11px',
              fontWeight: 600,
              color: '#0a0a0a',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            Change repository
          </button>
        </div>
      )}
    </aside>
  );
};
