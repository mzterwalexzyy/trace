import React, { useRef, useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  ShieldAlert,
  Activity,
  FolderGit2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  X,
} from 'lucide-react';

export type TabId = 'dashboard' | 'ask' | 'impact' | 'architecture' | 'runtime' | 'repository' | 'hydra';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  repoName: string;
  snapshotId: string;
  onChangeRepoClick: () => void;
  onGoToLanding: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
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
  mobileOpen = false,
  onCloseMobile,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTabSelect = (tab: TabId) => {
    setActiveTab(tab);
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  // If on mobile and not open, don't render desktop sidebar in standard flow
  if (isMobile && !mobileOpen) {
    return null;
  }

  const sidebarContent = (
    <aside
      onMouseEnter={() => {
        if (!isMobile) {
          clearTimer();
          setCollapsed(false);
        }
      }}
      onMouseLeave={() => {
        if (!isMobile) {
          clearTimer();
          timerRef.current = setTimeout(() => setCollapsed(true), 5000);
        }
      }}
      style={{
        width: isMobile ? '280px' : collapsed ? '64px' : '244px',
        background: '#ffffff',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: collapsed && !isMobile ? '18px 10px' : '18px 14px',
        color: 'var(--text-main)',
        flexShrink: 0,
        height: isMobile ? '100vh' : 'auto',
        minHeight: isMobile ? '100vh' : '100vh',
        transition: 'width 0.16s ease',
        boxSizing: 'border-box',
        zIndex: isMobile ? 100 : 1,
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        left: 0,
        boxShadow: isMobile ? '4px 0 16px rgba(0, 0, 0, 0.12)' : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* Brand + collapse / close toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed && !isMobile ? '2px' : '2px 8px' }}>
          <div
            onClick={() => {
              onGoToLanding();
              if (isMobile && onCloseMobile) onCloseMobile();
            }}
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
          {(!collapsed || isMobile) && (
            <span
              onClick={() => {
                onGoToLanding();
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.03em', color: '#0a0a0a', cursor: 'pointer' }}
            >
              TRACE
            </span>
          )}

          {isMobile ? (
            <button
              onClick={onCloseMobile}
              title="Close menu"
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'flex',
                padding: '4px',
              }}
            >
              <X size={20} />
            </button>
          ) : (
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
          )}
        </div>

        {/* Grouped nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: collapsed && !isMobile ? '10px' : '18px' }}>
          {GROUPS.map((group, gi) => (
            <div key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {!collapsed || isMobile ? (
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
                    onClick={() => handleTabSelect(item.id)}
                    title={collapsed && !isMobile ? item.label : undefined}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = '#f7f7f8';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                      gap: '11px',
                      padding: collapsed && !isMobile ? '10px 0' : '9px 10px',
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
                    {(!collapsed || isMobile) && item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom repository card */}
      {collapsed && !isMobile ? (
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
            marginBottom: '10px',
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Repository
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {repoName}
          </div>
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
            onClick={() => {
              onChangeRepoClick();
              if (isMobile && onCloseMobile) onCloseMobile();
            }}
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

  if (isMobile && mobileOpen) {
    return (
      <>
        <div className="mobile-sidebar-overlay" onClick={onCloseMobile} />
        {sidebarContent}
      </>
    );
  }

  return sidebarContent;
};
