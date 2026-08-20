import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Globe,
  Database,
  ArrowRight,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronRight,
  Code2,
  Boxes,
  Network,
  GitBranch,
  Crosshair,
  FileText,
  Layers,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react';
import { ChangeImpactReport } from '../../core/impact/intersection.js';
import { GraphNode } from '../../core/hydradb/types.js';

interface ChangeImpactHeroProps {
  report: ChangeImpactReport | null;
  loading?: boolean;
  onSelectNodeInGraph?: (node: GraphNode) => void;
  onSearchSymbol?: (symbolName: string) => void;
  onGoToRuntime?: () => void;
}

export const ChangeImpactHero: React.FC<ChangeImpactHeroProps> = ({
  report,
  loading,
  onSelectNodeInGraph,
  onSearchSymbol,
  onGoToRuntime,
}) => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [examples, setExamples] = useState<string[]>([]);
  const [activeLeftTab, setActiveLeftTab] = useState<'nodes' | 'files' | 'functions' | 'modules' | 'db'>('nodes');
  const [activeRightTab, setActiveRightTab] = useState<'verified' | 'unobserved'>('verified');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  // Sync search input with target symbol
  useEffect(() => {
    if (report?.targetSymbol?.name) {
      setSearchInput(report.targetSymbol.name);
    }
  }, [report?.targetSymbol?.id]);

  // Fetch suggested chips from graph
  useEffect(() => {
    fetch('/api/symbols')
      .then((r) => r.json())
      .then((d) => {
        const nodes = (d.symbols || []).map((s: any) => s.node);
        const eps = nodes.filter((n: any) => n.type === 'APIEndpoint').map((n: any) => n.name);
        const fns = nodes.filter((n: any) => n.type === 'Function' || n.type === 'Method').map((n: any) => n.name);
        setExamples([...eps.slice(0, 2), ...fns.slice(0, 3)].slice(0, 4));
      })
      .catch(() => setExamples([]));
  }, [report?.targetSymbol?.snapshotId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim() && onSearchSymbol) {
      onSearchSymbol(searchInput.trim());
    }
  };

  const handleExampleClick = (sym: string) => {
    setSearchInput(sym);
    if (onSearchSymbol) onSearchSymbol(sym);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '60px 24px' }}>
          <ShieldAlert size={36} style={{ margin: '0 auto 16px', color: '#09090b' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#09090b', marginBottom: '8px' }}>Analyzing change impact...</h2>
          <p style={{ fontSize: '14px', color: '#71717a', maxWidth: '540px', margin: '0 auto' }}>
            Traversing the dependency graph and correlating runtime evidence.
          </p>
        </div>
      </div>
    );
  }

  if (!report || !report.targetSymbol) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.02em' }}>Change Impact</h1>
          <p style={{ color: '#71717a', fontSize: '14px', margin: '4px 0 0 0' }}>Understand what your changes can affect.</p>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '40px 28px', textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ margin: '0 auto 14px', color: '#10b981' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#09090b', marginBottom: '6px' }}>Repository analyzed</h2>
          <p style={{ fontSize: '14px', color: '#71717a', maxWidth: '520px', margin: '0 auto 22px' }}>
            TRACE has built the static graph for this repository. Search a function, endpoint or file to compute its change impact.
          </p>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', maxWidth: '520px', margin: '0 auto 18px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#a1a1aa' }} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search a symbol, file or endpoint..."
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 38px',
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '8px',
                  color: '#09090b',
                  fontSize: '13px',
                  fontFamily: 'JetBrains Mono, monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button type="submit" style={{ background: '#000000', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Analyze <ArrowRight size={15} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tgt = report.targetSymbol;

  // Derive counts and tables
  const verifiedRoutes = report.endpoints.filter((e) => e.status === 'VERIFIED').length;
  const unobservedRoutes = report.endpoints.filter((e) => e.status === 'UNOBSERVED').length;
  const totalAffected = report.totalAffectedNodes || 0;
  const dbDepsCount = report.dbSchemas.length || 0;

  // Change risk calculation
  const risk = totalAffected > 50 || unobservedRoutes > 2 ? 'High' : totalAffected > 10 || unobservedRoutes > 0 ? 'Medium' : 'Low';
  const riskColor = risk === 'High' ? '#dc2626' : risk === 'Medium' ? '#d97706' : '#10b981';

  // Build Left Column Items based on selected sub-tab
  const allClassifiedNodes = report.classifiedPaths.flatMap((cp) => cp.path.nodes);
  const dbItems = report.dbSchemas.map((s: any) => ({
    name: (s.schemaNode || s).name,
    filePath: (s.schemaNode || s).filePath || 'db/query-builder.js:142',
    type: 'Database',
    icon: <Database size={15} style={{ color: '#52525b' }} />,
  }));

  const functionItems = allClassifiedNodes
    .filter((n) => n.type === 'Function' || n.type === 'Method')
    .map((n) => ({
      name: n.name,
      filePath: `${n.filePath || 'src/index.ts'}:${n.startLine || 1}`,
      type: 'Function',
      icon: <Code2 size={15} style={{ color: '#52525b' }} />,
    }));

  const fileItems = Array.from(new Set(allClassifiedNodes.map((n) => n.filePath).filter(Boolean))).map((f) => ({
    name: f,
    filePath: f,
    type: 'File',
    icon: <FileText size={15} style={{ color: '#52525b' }} />,
  }));

  const moduleItems = allClassifiedNodes
    .filter((n) => n.type === 'Module' || n.type === 'Class')
    .map((n) => ({
      name: n.name,
      filePath: n.filePath || 'src/module.ts',
      type: 'Module',
      icon: <Layers size={15} style={{ color: '#52525b' }} />,
    }));

  const defaultAllNodes = [...dbItems, ...functionItems, ...fileItems, ...moduleItems];

  let displayItems = defaultAllNodes;
  if (activeLeftTab === 'files') displayItems = fileItems;
  if (activeLeftTab === 'functions') displayItems = functionItems;
  if (activeLeftTab === 'modules') displayItems = moduleItems;
  if (activeLeftTab === 'db') displayItems = dbItems;

  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize));
  const paginatedItems = displayItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Right Column Lists
  const verifiedList = report.endpoints.filter((e) => e.status === 'VERIFIED');
  const unobservedList = report.endpoints.filter((e) => e.status === 'UNOBSERVED');
  const currentRightList = activeRightTab === 'verified' ? verifiedList : unobservedList;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Subtitle */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', margin: 0, letterSpacing: '-0.02em' }}>
          Change Impact
        </h1>
        <p style={{ color: '#71717a', fontSize: '14px', margin: '4px 0 0 0' }}>
          Understand what your changes can affect.
        </p>
      </div>

      {/* Row 1: Search Bar & Actions */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, display: 'flex', gap: '10px', minWidth: '320px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '12px', color: '#71717a' }} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search a symbol, file or endpoint..."
              style={{
                width: '100%',
                padding: '10px 14px 10px 40px',
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '8px',
                color: '#09090b',
                fontSize: '13px',
                fontFamily: 'JetBrains Mono, monospace',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: '#000000',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Analyze <ArrowRight size={15} />
          </button>
        </form>

        {onSelectNodeInGraph && (
          <button
            onClick={() => onSelectNodeInGraph(tgt)}
            style={{
              background: '#ffffff',
              color: '#09090b',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              padding: '10px 18px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Crosshair size={15} /> View in graph
          </button>
        )}
      </div>

      {/* Row 2: Target Symbol Info & Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px' }}>
        <span style={{ color: '#71717a' }}>Impact for</span>
        <span style={{ fontWeight: '800', color: '#09090b', fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}>
          {tgt.name}
        </span>
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#ffffff', background: '#000000', borderRadius: '4px', padding: '2px 8px' }}>
          {tgt.type}
        </span>
        <span style={{ color: '#71717a', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
          {tgt.filePath || 'src/index.ts'}{tgt.startLine ? `:${tgt.startLine}` : ''}
        </span>

        {examples.slice(0, 3).map((ex, idx) => (
          <button
            key={idx}
            onClick={() => handleExampleClick(ex)}
            style={{
              fontSize: '11px',
              fontFamily: 'JetBrains Mono, monospace',
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              color: '#52525b',
              padding: '2px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Row 3: 6 Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
        {/* Card 1: Affected Nodes */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Boxes size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {totalAffected.toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Affected nodes</div>
          </div>
        </div>

        {/* Card 2: API Endpoints */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Network size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {report.endpoints.length}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>API endpoints</div>
          </div>
        </div>

        {/* Card 3: DB Dependencies */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Database size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {dbDepsCount}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>DB dependencies</div>
          </div>
        </div>

        {/* Card 4: Verified Routes */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#10b981', lineHeight: '1.1' }}>
              {verifiedRoutes}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Verified routes</div>
          </div>
        </div>

        {/* Card 5: Unobserved Routes */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <AlertTriangle size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#09090b', lineHeight: '1.1' }}>
              {unobservedRoutes}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Unobserved routes</div>
          </div>
        </div>

        {/* Card 6: Change Risk */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: riskColor }}>
            <ShieldAlert size={16} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: riskColor, lineHeight: '1.1' }}>
              {risk}
            </div>
            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>Change risk</div>
          </div>
        </div>
      </div>

      {/* Row 4: Two Main Cards (What could be affected & Runtime evidence) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* LEFT CARD: What could be affected */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#09090b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: '#09090b' }} />
              What could be affected
            </h3>
            <p style={{ fontSize: '12px', color: '#71717a', margin: '4px 0 0 0' }}>
              Everything that depends on this code.
            </p>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e4e4e7', paddingBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
            <span
              onClick={() => { setActiveLeftTab('nodes'); setCurrentPage(1); }}
              style={{ cursor: 'pointer', color: activeLeftTab === 'nodes' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'nodes' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Nodes ({totalAffected})
            </span>
            <span
              onClick={() => { setActiveLeftTab('files'); setCurrentPage(1); }}
              style={{ cursor: 'pointer', color: activeLeftTab === 'files' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'files' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Files ({fileItems.length})
            </span>
            <span
              onClick={() => { setActiveLeftTab('functions'); setCurrentPage(1); }}
              style={{ cursor: 'pointer', color: activeLeftTab === 'functions' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'functions' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Functions ({functionItems.length})
            </span>
            <span
              onClick={() => { setActiveLeftTab('modules'); setCurrentPage(1); }}
              style={{ cursor: 'pointer', color: activeLeftTab === 'modules' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'modules' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Modules ({moduleItems.length})
            </span>
            <span
              onClick={() => { setActiveLeftTab('db'); setCurrentPage(1); }}
              style={{ cursor: 'pointer', color: activeLeftTab === 'db' ? '#09090b' : '#a1a1aa', borderBottom: activeLeftTab === 'db' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              DB ({dbDepsCount})
            </span>
          </div>

          {/* Table Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: '#71717a', padding: '0 4px' }}>
            <span>Dependency</span>
            <span>Type</span>
          </div>

          {/* Table Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '320px' }}>
            {paginatedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '13px' }}>
                No dependencies found in this category.
              </div>
            ) : (
              paginatedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #f4f4f5',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.icon}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#a1a1aa', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {item.filePath}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#71717a', flexShrink: 0 }}>
                    {item.type}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', borderTop: '1px solid #f4f4f5', paddingTop: '14px', fontSize: '12px', color: '#71717a' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ background: 'transparent', border: 'none', cursor: currentPage === 1 ? 'default' : 'pointer', color: currentPage === 1 ? '#e4e4e7' : '#09090b' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: '700', color: '#09090b' }}>{currentPage}</span>
            <span>of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ background: 'transparent', border: 'none', cursor: currentPage === totalPages ? 'default' : 'pointer', color: currentPage === totalPages ? '#e4e4e7' : '#09090b' }}
            >
              <ChevronRight size={16} />
            </button>
            <span style={{ fontSize: '11px', color: '#a1a1aa', marginLeft: '12px' }}>{pageSize} / page</span>
          </div>
        </div>

        {/* RIGHT CARD: Runtime evidence */}
        <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#09090b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#10b981' }} />
              Runtime evidence
            </h3>
            <p style={{ fontSize: '12px', color: '#71717a', margin: '4px 0 0 0', lineHeight: '1.5' }}>
              Routes that have <strong style={{ color: '#10b981' }}>actually been seen running</strong> (verified) versus <strong style={{ color: '#d97706' }}>never observed</strong> (a blind spot).
            </p>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e4e4e7', paddingBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
            <span
              onClick={() => setActiveRightTab('verified')}
              style={{ cursor: 'pointer', color: activeRightTab === 'verified' ? '#10b981' : '#a1a1aa', borderBottom: activeRightTab === 'verified' ? '2px solid #10b981' : 'none', paddingBottom: '8px' }}
            >
              Verified ({verifiedRoutes})
            </span>
            <span
              onClick={() => setActiveRightTab('unobserved')}
              style={{ cursor: 'pointer', color: activeRightTab === 'unobserved' ? '#09090b' : '#a1a1aa', borderBottom: activeRightTab === 'unobserved' ? '2px solid #09090b' : 'none', paddingBottom: '8px' }}
            >
              Unobserved ({unobservedRoutes})
            </span>
          </div>

          {/* Content Area */}
          <div style={{ minHeight: '320px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {currentRightList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>
                  <Search size={28} />
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#09090b', margin: 0 }}>
                  No runtime evidence yet
                </h4>
                <p style={{ fontSize: '13px', color: '#71717a', maxWidth: '320px', margin: 0, lineHeight: '1.5' }}>
                  Run your application or a demo to capture execution traces for this code.
                </p>
                {onGoToRuntime && (
                  <button
                    onClick={onGoToRuntime}
                    style={{
                      background: '#ffffff',
                      color: '#09090b',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                      padding: '8px 18px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '8px',
                    }}
                  >
                    Go to Runtime <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentRightList.map((ep, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #f4f4f5',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'JetBrains Mono, monospace', color: '#09090b' }}>
                        {ep.endpointNode.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>
                        {ep.status === 'VERIFIED' ? `Observed ${ep.traceCount || 1} times` : 'No runtime evidence'}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: ep.status === 'VERIFIED' ? '#10b981' : '#d97706' }}>
                      ● {ep.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: HydraDB Context Footer Card */}
      <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b' }}>
            <Database size={18} />
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#09090b', margin: 0 }}>
              HydraDB context
            </h4>
            <p style={{ fontSize: '13px', color: '#71717a', margin: '2px 0 0 0' }}>
              Related context retrieved from HydraDB for this symbol.
            </p>
          </div>
        </div>

        <button
          style={{
            background: '#ffffff',
            color: '#09090b',
            border: 'none',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          View context <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
};
