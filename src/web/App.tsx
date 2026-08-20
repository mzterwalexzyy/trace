import React, { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { Sidebar, TabId } from './components/Sidebar.js';
import { Dashboard } from './components/Dashboard.js';
import { ChangeImpactHero } from './components/ChangeImpactHero.js';
import { ArchitectureGraph } from './components/ArchitectureGraph.js';
import { RuntimeTraces } from './components/RuntimeTraces.js';
import { RepositoryView } from './components/RepositoryView.js';
import { HydraDBView } from './components/HydraDBView.js';
import { AskTrace } from './components/AskTrace.js';
import { LandingPage } from './components/LandingPage.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { SymbolSidePanel } from './components/SymbolSidePanel.js';
import { GraphNode, GraphEdge } from '../core/hydradb/types.js';
import { StorageModeInfo } from '../core/hydradb/interface.js';
import { ChangeImpactReport } from '../core/impact/intersection.js';

// URL <-> tab mapping so every view is addressable, bookmarkable, and works
// with the browser back/forward buttons. The server serves the SPA for any
// path, so deep links (e.g. /architecture) load straight into that view.
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
  // Show the landing only at the root path; a deep link goes straight to the app.
  const [showLanding, setShowLanding] = useState<boolean>(!initialTab);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [snapshotId, setSnapshotId] = useState<string>('');
  const [repoName, setRepoName] = useState<string>('');
  const [repoPath, setRepoPath] = useState<string>('');
  const [storageModeInfo, setStorageModeInfo] = useState<StorageModeInfo | undefined>(undefined);
  const [traces, setTraces] = useState<any[]>([]);
  const [impactReport, setImpactReport] = useState<ChangeImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);

  const [selectedSideNode, setSelectedSideNode] = useState<GraphNode | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  // Focus request from the symbol panel → Architecture graph. The nonce lets the
  // same node be re-focused (effect fires on every request, not just id change).
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  // Blocking analyze overlay: while a repo is being processed we stay put and
  // show progress, then navigate only once the fresh graph has loaded — so the
  // target page never flashes the previous repo's data.
  const [analyzing, setAnalyzing] = useState<{ label: string } | null>(null);

  // Run an analysis, keeping the user on a progress overlay until the new graph
  // is fully loaded, then navigate to `targetTab`.
  const runAnalyze = async (body: Record<string, any>, label: string, targetTab: TabId) => {
    setAnalyzing({ label });
    setSelectedSideNode(null);
    // Hard timeout so a very large or wedged analysis can never hang forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);
    try {
      const res = await fetch('/api/repository/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Analysis failed');
      await loadGraphAndRepo();
      await loadTraces();
      // Repository analysis is whole-repo static analysis only. It does NOT
      // auto-select a symbol for Change Impact — the user chooses that later.
      setImpactReport(null);
      // Give the demo real runtime evidence out of the box (a genuine trace),
      // so VERIFIED vs UNOBSERVED is demonstrable without a manual step.
      if (body.useDemo) {
        try {
          await fetch('/api/runtime/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: 'checkout' }) });
          await loadTraces();
        } catch { /* non-fatal */ }
      }
      setActiveTab(targetTab);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        alert('Analysis is taking unusually long and was stopped. The repository may be very large.');
      } else {
        console.error('Analyze failed:', err);
        alert(`Could not analyze repository: ${err.message}`);
      }
    } finally {
      clearTimeout(timeout);
      setAnalyzing(null);
    }
  };

  const loadGraphAndRepo = () => {
    return fetch('/api/graph')
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
        .catch((err) => console.error('Failed to fetch impact for symbol:', err))
        .finally(() => setImpactLoading(false));
      return;
    }

    fetch('/api/diff')
      .then((res) => res.json())
      .then(async (diffs) => {
        if (diffs && diffs.length > 0) {
          setImpactReport(diffs[0].report);
        } else {
          const g = await (await fetch('/api/graph')).json();
          const firstFn = g.nodes?.find((n: any) => n.type === 'Function' || n.type === 'Method');
          if (firstFn) {
            const rep = await (await fetch(`/api/impact/${encodeURIComponent(firstFn.id)}`)).json();
            setImpactReport(rep);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch diff impact:', err))
      .finally(() => setImpactLoading(false));
  };

  useEffect(() => {
    loadGraphAndRepo();
    loadTraces();
  }, []);

  // Keep the URL in sync with the current view (without adding history spam:
  // replaceState for the landing, pushState for real navigations).
  useEffect(() => {
    const path = showLanding ? '/' : TAB_TO_PATH[activeTab];
    if (window.location.pathname !== path) {
      window.history.pushState({ tab: activeTab, landing: showLanding }, '', path);
    }
  }, [activeTab, showLanding]);

  // Browser back/forward → restore the matching view.
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
    const body = useDemo || !targetPath ? { useDemo: true } : { repoPath: targetPath };
    const label = useDemo || !targetPath ? 'demo-app' : targetPath;
    void runAnalyze(body, label, 'dashboard');
  };

  const handleSelectSymbolNode = (node: GraphNode) => {
    setSelectedSideNode(node);
  };

  const handleFocusNode = (node: GraphNode) => {
    setFocusRequest({ id: node.id, nonce: Date.now() });
    setActiveTab('architecture');
    setSelectedSideNode(null);
  };

  // Switch to an already-analyzed repository by re-analyzing its path (the
  // server keeps one active graph; re-analysis rebuilds it deterministically).
  const handleSwitchRepo = (targetPath: string) => {
    if (!targetPath) return;
    const label = targetPath.split(/[\\/]/).pop() || targetPath;
    void runAnalyze({ repoPath: targetPath }, label, activeTab);
  };

  const handleAnalyzeImpactForNode = (node: GraphNode) => {
    // Navigate immediately so the click feels responsive, then load the report.
    setSelectedSideNode(null);
    setActiveTab('impact');
    setImpactLoading(true);
    fetch(`/api/impact/${encodeURIComponent(node.id)}`)
      .then((res) => res.json())
      .then((report) => setImpactReport(report))
      .catch((err) => console.error('Failed to run impact for node:', err))
      .finally(() => setImpactLoading(false));
  };

  const handleSearchSymbolName = (symbolName: string) => {
    setActiveTab('impact');
    setImpactLoading(true);
    loadDiffImpact(symbolName);
  };

  const handlePingHydra = () => {
    fetch('/api/hydra/ping')
      .then((r) => r.json())
      .then((d) => {
        if (d.storageMode) setStorageModeInfo(d.storageMode);
      });
  };

  if (showLanding) {
    return <LandingPage onEnterDashboard={handleEnterDashboard} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', color: 'var(--text-main)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {analyzing && <AnalyzeOverlay label={analyzing.label} onSkip={() => { setAnalyzing(null); setActiveTab('dashboard'); }} />}
      {/* Left Sidebar matching reference image */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        repoName={repoName}
        snapshotId={snapshotId}
        onChangeRepoClick={() => setShowOnboarding(true)}
        onGoToLanding={() => setShowLanding(true)}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          snapshotId={snapshotId}
          repoName={repoName}
          storageModeInfo={storageModeInfo}
          onChangeRepoClick={() => setShowOnboarding(true)}
          onSwitchRepo={handleSwitchRepo}
          onSelectSymbol={handleSelectSymbolNode}
          onRefreshHydraPing={handlePingHydra}
          onGoToLanding={() => setShowLanding(true)}
        />

        <main style={{ paddingBottom: '40px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {activeTab === 'dashboard' && (
            <Dashboard
              onNavigate={setActiveTab}
              onConnectRepo={() => setShowOnboarding(true)}
              onSwitchRepo={handleSwitchRepo}
              activeRepoName={repoName}
            />
          )}
          {activeTab === 'impact' && (
            <ChangeImpactHero
              report={impactReport}
              loading={impactLoading}
              onSelectNodeInGraph={handleSelectSymbolNode}
              onSearchSymbol={handleSearchSymbolName}
            />
          )}
          {/* Kept mounted (hidden when inactive) so the exploration state —
              drill-in crumbs, focus, zoom — is preserved when you jump to
              Change Impact and come back. */}
          <div style={{ display: activeTab === 'architecture' ? 'block' : 'none' }}>
            <ArchitectureGraph
              nodes={nodes}
              edges={edges}
              traces={traces}
              storageMode={storageModeInfo}
              onSelectNode={handleSelectSymbolNode}
              onAnalyzeImpact={handleAnalyzeImpactForNode}
              focusRequest={focusRequest}
            />
          </div>
          {activeTab === 'runtime' && <RuntimeTraces traces={traces} activeRepoName={repoName} onRefreshTraces={loadTraces} onSelectNode={handleSelectSymbolNode} />}
          {activeTab === 'repository' && (
            <RepositoryView
              activeRepoName={repoName}
              onConnectRepo={() => setShowOnboarding(true)}
              onSwitchRepo={handleSwitchRepo}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'hydra' && <HydraDBView />}
          {activeTab === 'ask' && (
            <AskTrace
              activeRepoName={repoName}
              onOpenImpact={handleSearchSymbolName}
              onNavigate={setActiveTab}
            />
          )}
        </main>
      </div>

      {/* Side Panel for Symbol Inspection */}
      <SymbolSidePanel
        symbolNode={selectedSideNode}
        onClose={() => setSelectedSideNode(null)}
        onAnalyzeImpact={handleAnalyzeImpactForNode}
        onFocusNode={handleFocusNode}
      />

      {/* Onboarding & Repository Switcher Modal */}
      {showOnboarding && (
        <OnboardingModal
          onAnalysisComplete={async () => {
            setShowOnboarding(false);
            setAnalyzing({ label: 'Loading analysis' });
            await loadGraphAndRepo();
            await loadTraces();
            setImpactReport(null);
            setActiveTab('dashboard');
            setAnalyzing(null);
          }}
          onCancel={() => setShowOnboarding(false)}
          isClosable={nodes.length > 0}
        />
      )}
    </div>
  );
}

// Full-screen progress overlay shown while a repository is analyzed, so the app
// never flashes stale data. Steps are indeterminate (the analyze POST returns
// only when done) but communicate the real phases the server goes through.
function AnalyzeOverlay({ label, onSkip }: { label: string; onSkip: () => void }) {
  const steps = ['Fetching source', 'Parsing the AST', 'Building the dependency graph', 'Ingesting context to HydraDB'];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % steps.length), 1400);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '380px', maxWidth: '90vw', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{ width: '22px', height: '22px', background: '#0a0a0a', clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} className="pulse" />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0a0a0a' }}>Analyzing repository</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{label}</div>
          </div>
        </div>
        {/* Indeterminate progress bar */}
        <div style={{ height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden', marginBottom: '18px', position: 'relative' }}>
          <div style={{ position: 'absolute', height: '100%', width: '40%', background: '#0a0a0a', borderRadius: '2px', animation: 'trace-indeterminate 1.1s ease-in-out infinite' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: i <= step ? '#0a0a0a' : 'var(--text-dim)', fontWeight: i === step ? 600 : 400 }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: i < step ? '#059669' : i === step ? '#0a0a0a' : 'var(--border-color)', flexShrink: 0 }} className={i === step ? 'pulse' : ''} />
              {s}
            </div>
          ))}
        </div>
        <button
          onClick={onSkip}
          style={{ marginTop: '18px', width: '100%', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Skip to dashboard
        </button>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', margin: '8px 0 0' }}>Analysis continues in the background.</p>
      </div>
    </div>
  );
}
