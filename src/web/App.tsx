import React, { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { Sidebar, TabId } from './components/Sidebar.js';
import { ChangeImpactHero } from './components/ChangeImpactHero.js';
import { ArchitectureGraph } from './components/ArchitectureGraph.js';
import { RuntimeTraces } from './components/RuntimeTraces.js';
import { RepositoryView } from './components/RepositoryView.js';
import { LandingPage } from './components/LandingPage.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { SymbolSidePanel } from './components/SymbolSidePanel.js';
import { Dashboard } from './components/Dashboard.js';
import { AskTrace } from './components/AskTrace.js';
import { HydraDBView } from './components/HydraDBView.js';
import { About } from './components/About.js';
import { GraphNode, GraphEdge } from '../core/hydradb/types.js';
import { StorageModeInfo } from '../core/hydradb/interface.js';
import { ChangeImpactReport } from '../core/impact/intersection.js';

// URL <-> tab mapping so every view is addressable and survives a refresh.
const TAB_TO_PATH: Record<TabId, string> = {
  dashboard: '/dashboard',
  ask: '/ask',
  impact: '/change-impact',
  architecture: '/architecture',
  runtime: '/runtime',
  repository: '/repository',
  hydra: '/hydradb',
};
const PATH_TO_TAB: Record<string, TabId> = {
  '/dashboard': 'dashboard',
  '/ask': 'ask',
  '/change-impact': 'impact',
  '/architecture': 'architecture',
  '/runtime': 'runtime',
  '/repository': 'repository',
  '/hydradb': 'hydra',
};

export function App() {
  const initialPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  const initialTab = PATH_TO_TAB[initialPath];
  const [activeTab, setActiveTab] = useState<TabId>(initialTab || 'dashboard');
  // The root path shows the landing page; a known tab path (e.g. /dashboard,
  // /runtime) opens that view directly and survives a refresh. Unknown paths
  // (other than /about) fall back to the landing page too.
  const [showLanding, setShowLanding] = useState<boolean>(!initialTab && initialPath !== '/about');
  const [showAbout, setShowAbout] = useState<boolean>(initialPath === '/about');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [snapshotId, setSnapshotId] = useState<string>('');
  const [repoName, setRepoName] = useState<string>('');
  const [repoPath, setRepoPath] = useState<string>('');
  const [storageModeInfo, setStorageModeInfo] = useState<StorageModeInfo | undefined>(undefined);
  const [traces, setTraces] = useState<any[]>([]);
  const [impactReport, setImpactReport] = useState<ChangeImpactReport | null>(null);

  const [selectedSideNode, setSelectedSideNode] = useState<GraphNode | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  const loadGraphAndRepo = () => {
    fetch('/api/graph')
      .then((res) => res.json())
      .then((data) => {
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        if (data.snapshotId) setSnapshotId(data.snapshotId);
        if (data.storageMode) setStorageModeInfo(data.storageMode);
        if (data.repoName) setRepoName(data.repoName);
        if (data.repoPath) setRepoPath(data.repoPath);
      })
      .catch((err) => {
        console.error('Failed to fetch graph:', err);
      });
  };

  const loadTraces = () => {
    fetch('/api/traces')
      .then((res) => res.json())
      .then((data) => setTraces(data || []))
      .catch((err) => console.error('Failed to fetch traces:', err));
  };

  const loadDiffImpact = (targetSymbolName?: string) => {
    if (targetSymbolName) {
      fetch(`/api/impact/${encodeURIComponent(targetSymbolName)}`)
        .then((res) => res.json())
        .then((rep) => setImpactReport(rep))
        .catch((err) => console.error('Failed to fetch impact for symbol:', err));
      return;
    }

    fetch('/api/diff')
      .then((res) => res.json())
      .then((diffs) => {
        if (diffs && diffs.length > 0) {
          setImpactReport(diffs[0].report);
        } else {
          fetch('/api/graph')
            .then((r) => r.json())
            .then((g) => {
              const firstFn = g.nodes?.find((n: any) => n.type === 'Function');
              if (firstFn) {
                fetch(`/api/impact/${encodeURIComponent(firstFn.id)}`)
                  .then((r) => r.json())
                  .then((rep) => setImpactReport(rep));
              }
            });
        }
      })
      .catch((err) => console.error('Failed to fetch diff impact:', err));
  };

  useEffect(() => {
    loadGraphAndRepo();
    loadTraces();
    loadDiffImpact();
  }, []);

  // Keep the URL in sync with the active view so refresh/back/forward and
  // shared links land on the right page instead of always the impact page.
  useEffect(() => {
    const path = showLanding ? '/' : TAB_TO_PATH[activeTab];
    if (window.location.pathname !== path) {
      window.history.pushState({ tab: activeTab, landing: showLanding }, '', path);
    }
  }, [activeTab, showLanding]);

  useEffect(() => {
    const onPop = () => {
      const tab = PATH_TO_TAB[window.location.pathname];
      if (tab) {
        setShowLanding(false);
        setActiveTab(tab);
      } else {
        setShowLanding(true);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleEnterDashboard = (targetPath?: string, useDemo: boolean = true) => {
    setShowLanding(false);
    setShowOnboarding(false);
    setActiveTab('impact');

    fetch('/api/repository/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(useDemo || !targetPath ? { useDemo: true } : { repoPath: targetPath }),
    })
      .then((res) => res.json())
      .then(() => {
        loadGraphAndRepo();
        loadTraces();
        loadDiffImpact();
      })
      .catch((err) => {
        console.error('Failed to analyze repository:', err);
      });
  };

  const handleSelectSymbolNode = (node: GraphNode) => {
    setSelectedSideNode(node);
  };

  const handleAnalyzeImpactForNode = (node: GraphNode) => {
    setSelectedSideNode(null);
    fetch(`/api/impact/${encodeURIComponent(node.id)}`)
      .then((res) => res.json())
      .then((report) => {
        setImpactReport(report);
        setActiveTab('impact');
      })
      .catch((err) => console.error('Failed to run impact for node:', err));
  };

  const handleSearchSymbolName = (symbolName: string) => {
    loadDiffImpact(symbolName);
    setActiveTab('impact');
  };

  const handlePingHydra = () => {
    fetch('/api/hydra/ping')
      .then((r) => r.json())
      .then((d) => {
        if (d.storageMode) setStorageModeInfo(d.storageMode);
      });
  };

  if (showAbout) {
    return <About onBack={() => { setShowAbout(false); window.history.pushState({}, '', '/'); }} />;
  }

  if (showLanding) {
    return <LandingPage onEnterDashboard={handleEnterDashboard} onOpenDocs={() => { setShowAbout(true); window.history.pushState({}, '', '/about'); }} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#fafafa', color: '#09090b', fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        repoName={repoName}
        snapshotId={snapshotId}
        onChangeRepoClick={() => setShowOnboarding(true)}
        onGoToLanding={() => setShowLanding(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          snapshotId={snapshotId}
          repoName={repoName}
          storageModeInfo={storageModeInfo}
          onChangeRepoClick={() => setShowOnboarding(true)}
          onSelectSymbol={handleSelectSymbolNode}
          onRefreshHydraPing={handlePingHydra}
          onGoToLanding={() => setShowLanding(true)}
          onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)}
        />

        <main style={{ paddingBottom: '40px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {activeTab === 'dashboard' && (
            <Dashboard
              onNavigate={setActiveTab}
              onConnectRepo={() => setShowOnboarding(true)}
              onSwitchRepo={(pathStr) => handleEnterDashboard(pathStr, false)}
              activeRepoName={repoName}
            />
          )}
          {activeTab === 'ask' && (
            <AskTrace
              onNavigate={setActiveTab}
              onOpenImpact={handleSearchSymbolName}
              activeRepoName={repoName}
            />
          )}
          {activeTab === 'impact' && (
            <ChangeImpactHero
              report={impactReport}
              onSelectNodeInGraph={handleSelectSymbolNode}
              onSearchSymbol={handleSearchSymbolName}
              onGoToRuntime={() => setActiveTab('runtime')}
            />
          )}
          {activeTab === 'architecture' && <ArchitectureGraph nodes={nodes} edges={edges} onSelectNode={handleSelectSymbolNode} />}
          {activeTab === 'runtime' && <RuntimeTraces traces={traces} activeRepoName={repoName} onRefreshTraces={loadTraces} onSelectNode={handleSelectSymbolNode} onOpenImpact={handleSearchSymbolName} />}
          {activeTab === 'repository' && (
            <RepositoryView
              activeRepoName={repoName}
              onConnectRepo={() => setShowOnboarding(true)}
              onSwitchRepo={(pathStr) => handleEnterDashboard(pathStr, false)}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'hydra' && <HydraDBView />}
        </main>
      </div>

      {/* Side Panel for Symbol Inspection */}
      <SymbolSidePanel
        symbolNode={selectedSideNode}
        onClose={() => setSelectedSideNode(null)}
        onAnalyzeImpact={handleAnalyzeImpactForNode}
      />

      {/* Onboarding & Repository Switcher Modal */}
      {showOnboarding && (
        <OnboardingModal
          onAnalysisComplete={() => {
            setShowOnboarding(false);
            loadGraphAndRepo();
            loadTraces();
            loadDiffImpact();
            setActiveTab('impact');
          }}
          onCancel={() => setShowOnboarding(false)}
          isClosable={nodes.length > 0}
        />
      )}
    </div>
  );
}
