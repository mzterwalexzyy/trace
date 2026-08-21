import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  FileCode2,
  FunctionSquare,
  Database,
  Globe,
  Package,
  ChevronRight,
  Crosshair,
  Layers,
  Activity,
  Server,
  ArrowRight,
  Download,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Lock,
  Unlock,
  ArrowLeft,
  Home,
  SlidersHorizontal,
} from 'lucide-react';
import { GraphNode, GraphEdge } from '../../core/hydradb/types.js';
import { StorageModeInfo } from '../../core/hydradb/interface.js';
import {
  ViewNode,
  ViewEdge,
  buildSystemView,
  buildModuleView,
  buildFileView,
  buildFocusView,
  buildTypeView,
  domainLabel,
  domainOfPath,
  runtimeActiveNames,
  runtimeObservedPairs,
} from './graph-model.js';

interface TraceItem {
  traceNode: GraphNode;
  spans: GraphNode[];
}

interface ArchitectureGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  traces?: TraceItem[];
  storageMode?: StorageModeInfo;
  onSelectNode: (node: GraphNode) => void;
  onAnalyzeImpact?: (node: GraphNode) => void;
  focusRequest?: { id: string; nonce: number } | null;
}

type ViewMode = 'static' | 'runtime' | 'combined';

interface Crumb {
  level: 'system' | 'module' | 'file';
  key?: string;
  fileNode?: GraphNode;
  label: string;
}

const CARD_W = 216;
const CARD_H = 68;

const nodeActionBtn = (primary: boolean): React.CSSProperties => ({
  fontSize: '10.5px',
  fontWeight: 600,
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  padding: '3px 9px',
  borderRadius: '6px',
  cursor: 'pointer',
  border: primary ? '1px solid #0a0a0a' : '1px solid var(--border-color)',
  background: primary ? '#0a0a0a' : '#ffffff',
  color: primary ? '#ffffff' : 'var(--text-main)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
});

const zoomBtn: React.CSSProperties = {
  width: '26px',
  height: '26px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-main)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

function kindIcon(kind: string, size = 16) {
  const common = { size } as any;
  switch (kind) {
    case 'domain':
      return <Boxes {...common} />;
    case 'File':
      return <FileCode2 {...common} />;
    case 'APIEndpoint':
      return <Globe {...common} />;
    case 'DBSchema':
      return <Database {...common} />;
    case 'External':
      return <Package {...common} />;
    case 'HydraDB':
      return <Server {...common} />;
    default:
      return <FunctionSquare {...common} />;
  }
}

function kindAccent(kind: string): string {
  switch (kind) {
    case 'domain':
      return '#0a0a0a';
    case 'APIEndpoint':
      return '#0a0a0a';
    case 'DBSchema':
      return '#059669';
    case 'External':
      return '#d97706';
    case 'HydraDB':
      return '#71717a';
    case 'File':
      return '#71717a';
    default:
      return '#52525b';
  }
}

/** Short blueprint-style type tag rendered in the corner of each card. */
function typeTag(kind: string): string {
  switch (kind) {
    case 'domain':
      return 'DOM';
    case 'File':
      return 'SRC';
    case 'APIEndpoint':
      return 'API';
    case 'DBSchema':
      return 'DAT';
    case 'External':
      return 'PKG';
    case 'HydraDB':
      return 'HYD';
    case 'Class':
      return 'CLS';
    default:
      return 'FN';
  }
}

// Swim-lanes for the system overview, ordered top to bottom by architectural role.
const LANES: { id: string; label: string; domains: string[] }[] = [
  { id: 'request', label: 'REQUEST / EDGE', domains: ['root', 'handlers', 'controllers', 'routes', 'api', 'web', 'components', 'server', 'frontend', 'pages'] },
  { id: 'core', label: 'CORE LOGIC', domains: ['services', 'core', 'cli', 'utils', 'auth', 'trace', 'lib', 'domain', 'models'] },
  { id: 'data', label: 'DATA & STORAGE', domains: ['db', 'database', 'store', 'repositories'] },
  { id: 'external', label: 'EXTERNAL', domains: ['__external__'] },
  { id: 'intel', label: 'INTELLIGENCE LAYER', domains: ['__hydra__'] },
];

function laneOf(domainKey: string): number {
  if (domainKey === '__hydra__') return 4;
  for (let i = 0; i < LANES.length; i++) {
    if (LANES[i].domains.includes(domainKey)) return i;
  }
  return 1; // default to CORE
}

/** Lane layout for the system overview: labelled horizontal bands. */
function laneLayout(vnodes: ViewNode[]) {
  const laneNodes = new Map<number, ViewNode[]>();
  for (const n of vnodes) {
    const key = n.id === 'hydradb' ? '__hydra__' : n.id.replace('domain:', '');
    const lane = laneOf(key);
    if (!laneNodes.has(lane)) laneNodes.set(lane, []);
    laneNodes.get(lane)!.push(n);
  }
  const activeLanes = Array.from(laneNodes.keys()).sort((a, b) => a - b);
  const hGap = 40;
  const laneVPad = 26;
  const laneLabelH = 22;
  const maxRow = Math.max(1, ...activeLanes.map((l) => laneNodes.get(l)!.length));
  const width = maxRow * (CARD_W + hGap);
  const pos = new Map<string, { x: number; y: number }>();
  const bands: { label: string; y: number; height: number }[] = [];

  let y = 10;
  for (const lane of activeLanes) {
    const row = laneNodes.get(lane)!.sort((a, b) => a.label.localeCompare(b.label));
    const rowWidth = row.length * (CARD_W + hGap);
    const offset = (width - rowWidth) / 2;
    const bandTop = y;
    const cardY = y + laneLabelH + laneVPad / 2;
    row.forEach((n, i) => {
      pos.set(n.id, { x: offset + i * (CARD_W + hGap) + hGap / 2, y: cardY });
    });
    const bandHeight = laneLabelH + laneVPad + CARD_H + 8;
    bands.push({ label: LANES[lane].label, y: bandTop, height: bandHeight });
    y = bandTop + bandHeight + 14;
  }

  return { pos, width: Math.max(width, CARD_W + hGap), height: y, bands };
}

/** Longest-path layered layout: rows top-to-bottom, nodes spread per row. */
function layeredLayout(vnodes: ViewNode[], vedges: ViewEdge[]) {
  const ids = new Set(vnodes.map((n) => n.id));
  const layer = new Map<string, number>();
  vnodes.forEach((n) => layer.set(n.id, 0));
  const adj = vedges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);

  // Relax layers (bounded to avoid cycles blowing up).
  for (let iter = 0; iter < vnodes.length + 2; iter++) {
    let changed = false;
    for (const e of adj) {
      const nl = Math.min((layer.get(e.from) || 0) + 1, vnodes.length);
      if (nl > (layer.get(e.to) || 0)) {
        layer.set(e.to, nl);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byLayer = new Map<number, ViewNode[]>();
  for (const n of vnodes) {
    const l = layer.get(n.id) || 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  }
  const layers = Array.from(byLayer.keys()).sort((a, b) => a - b);
  const hGap = 44;
  const vGap = 104;
  // Wide layers (e.g. many disconnected files in a module) wrap into a grid
  // instead of one endlessly-wide row, so the view stays scannable.
  const MAX_PER_ROW = 6;
  const perRow = Math.min(MAX_PER_ROW, Math.max(1, ...layers.map((l) => byLayer.get(l)!.length)));
  const blockWidth = perRow * (CARD_W + hGap);
  const pos = new Map<string, { x: number; y: number }>();

  let cursorY = 24;
  layers.forEach((l) => {
    const items = byLayer.get(l)!.sort((a, b) => a.label.localeCompare(b.label));
    const subRows = Math.ceil(items.length / perRow);
    items.forEach((n, i) => {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const itemsThisRow = Math.min(perRow, items.length - r * perRow);
      const rowWidth = itemsThisRow * (CARD_W + hGap);
      const offset = (blockWidth - rowWidth) / 2;
      pos.set(n.id, { x: offset + c * (CARD_W + hGap) + hGap / 2, y: cursorY + r * vGap });
    });
    cursorY += subRows * vGap + 20; // breathing room between dependency layers
  });

  return { pos, width: Math.max(blockWidth, CARD_W + hGap), height: cursorY + CARD_H };
}

/**
 * Column layout for focus mode: dependents left, target centre, dependencies
 * right. A depth level with many peers (a hub node can have 100+) is wrapped
 * into a compact multi-column block instead of one endless vertical stack, so
 * the view spreads across width (zoomable) rather than scrolling forever.
 */
function focusLayout(vnodes: (ViewNode & { column: number })[]) {
  const byCol = new Map<number, (ViewNode & { column: number })[]>();
  for (const n of vnodes) {
    if (!byCol.has(n.column)) byCol.set(n.column, []);
    byCol.get(n.column)!.push(n);
  }
  const cols = Array.from(byCol.keys()).sort((a, b) => a - b);
  const bandGap = 120; // gap between depth bands
  const subGap = 40; // gap between wrapped sub-columns within a band
  const vGap = 20;
  const MAX_ROWS = 10; // wrap a level once it exceeds this many rows

  // Total height is bounded by the tallest band (<= MAX_ROWS tall).
  const height = Math.min(MAX_ROWS, Math.max(1, ...cols.map((c) => byCol.get(c)!.length))) * (CARD_H + vGap) + 40;
  const pos = new Map<string, { x: number; y: number }>();

  let xCursor = 20;
  cols.forEach((c) => {
    const items = byCol.get(c)!.sort((a, b) => a.label.localeCompare(b.label));
    const rows = Math.min(MAX_ROWS, items.length);
    const subCols = Math.ceil(items.length / rows);
    const bandHeight = rows * (CARD_H + vGap);
    const offset = (height - bandHeight) / 2;
    items.forEach((n, i) => {
      const sc = Math.floor(i / rows);
      const r = i % rows;
      pos.set(n.id, { x: xCursor + sc * (CARD_W + subGap), y: offset + r * (CARD_H + vGap) });
    });
    xCursor += subCols * (CARD_W + subGap) - subGap + bandGap;
  });

  return { pos, width: Math.max(xCursor, CARD_W + bandGap), height };
}

export const ArchitectureGraph: React.FC<ArchitectureGraphProps> = ({
  nodes,
  edges,
  traces = [],
  storageMode,
  onSelectNode,
  onAnalyzeImpact,
  focusRequest,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('static');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ level: 'system', label: 'Architecture' }]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [depth, setDepth] = useState<number>(2);
  const [direction, setDirection] = useState<'both' | 'dependencies' | 'dependents'>('both');
  const [showHydra, setShowHydra] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  // Interaction state: zoom, node hover, and edge hover/tooltip.
  const [zoom, setZoom] = useState<number>(1);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverEdgeIdx, setHoverEdgeIdx] = useState<number | null>(null);
  const [edgeTip, setEdgeTip] = useState<{ x: number; y: number; text: string; observed: boolean } | null>(null);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [focusExpanded, setFocusExpanded] = useState<boolean>(false);
  const [locked, setLocked] = useState<boolean>(false);
  const [browseTab, setBrowseTab] = useState<'architecture' | 'modules' | 'files' | 'symbols'>('architecture');
  const [showFilter, setShowFilter] = useState<boolean>(false);

  // External focus request (e.g. "Focus in graph" from the symbol panel).
  useEffect(() => {
    if (focusRequest && nodes.some((n) => n.id === focusRequest.id)) {
      setFocusId(focusRequest.id);
      setFocusExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);
  const canvasScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Esc exits fullscreen.
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // When the analyzed repository changes, reset the exploration so stale
  // drill-in crumbs/focus from the previous repo don't linger. (Within the same
  // repo the state persists across tab switches, since the graph stays mounted.)
  const repoKey = nodes.find((n) => n.type === 'Repository')?.snapshotId || '';
  React.useEffect(() => {
    setCrumbs([{ level: 'system', label: 'Architecture' }]);
    setFocusId(null);
    setZoom(1);
    setSearch('');
    navHistory.current = [{ crumbs: [{ level: 'system', label: 'Architecture' }], focusId: null }];
    navPtr.current = 0;
    setNavTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoKey]);

  // --- Browser-style navigation history for graph drill-in / focus. ---
  const navHistory = React.useRef<{ crumbs: Crumb[]; focusId: string | null }[]>([
    { crumbs: [{ level: 'system', label: 'Architecture' }], focusId: null },
  ]);
  const navPtr = React.useRef(0);
  const navSkip = React.useRef(false);
  const [, setNavTick] = useState(0);

  // Record every navigation change (unless it came from back/forward itself).
  React.useEffect(() => {
    if (navSkip.current) {
      navSkip.current = false;
      return;
    }
    navHistory.current = navHistory.current.slice(0, navPtr.current + 1);
    navHistory.current.push({ crumbs, focusId });
    navPtr.current = navHistory.current.length - 1;
    setNavTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbs, focusId]);

  const applyNav = (s: { crumbs: Crumb[]; focusId: string | null }) => {
    navSkip.current = true;
    setBrowseTab('architecture');
    setCrumbs(s.crumbs);
    setFocusId(s.focusId);
    setNavTick((t) => t + 1);
  };
  const canBack = navPtr.current > 0;
  const canForward = navPtr.current < navHistory.current.length - 1;
  const goBack = () => {
    if (navPtr.current <= 0) return;
    navPtr.current -= 1;
    applyNav(navHistory.current[navPtr.current]);
  };
  const goForward = () => {
    if (navPtr.current >= navHistory.current.length - 1) return;
    navPtr.current += 1;
    applyNav(navHistory.current[navPtr.current]);
  };
  const goHome = () => {
    setBrowseTab('architecture');
    setFocusId(null);
    setCrumbs([{ level: 'system', label: 'Architecture' }]);
  };

  // Auto-fit: scale the graph to fill the canvas until the user zooms manually.
  // Small graphs scale up to spread into the empty space; large ones scale down.
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [fitZoom, setFitZoom] = useState<number>(1);
  const autoFitRef = React.useRef(autoFit);
  autoFitRef.current = autoFit;
  const lockedRef = React.useRef(locked);
  lockedRef.current = locked;

  const zoomIn = () => { setAutoFit(false); setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setAutoFit(false); setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2))); };
  const zoomReset = () => { setAutoFit(true); setZoom(1); };
  const effZoom = autoFit ? fitZoom : zoom;

  // Ctrl/Cmd + wheel zooms the canvas (non-passive so we can prevent page zoom).
  React.useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (lockedRef.current) return;
      e.preventDefault();
      setAutoFit(false);
      setZoom((z) => Math.min(2, Math.max(0.4, +(z - e.deltaY * 0.0016).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const runtimeNames = useMemo(() => runtimeActiveNames(traces), [traces]);
  const observedPairs = useMemo(() => runtimeObservedPairs(traces), [traces]);

  const current = crumbs[crumbs.length - 1];
  const symbolCount = nodes.filter((n) => ['Function', 'Method', 'Class', 'APIEndpoint'].includes(n.type)).length;
  const fileCount = nodes.filter((n) => n.type === 'File').length;
  const relCount = edges.filter((e) => e.type !== 'CONTAINS').length;
  const domainCount = new Set(
    nodes.filter((n) => n.type === 'File').map((n) => (n.filePath || n.name || '').split('/')[0] || 'root')
  ).size;

  // Build the active view-model.
  const view = useMemo(() => {
    // Files / Symbols sub-tabs filter the whole graph to that node type.
    if (!focusId && (browseTab === 'files' || browseTab === 'symbols')) {
      const tv = buildTypeView(nodes, edges, browseTab, runtimeNames, observedPairs, 80);
      return { vnodes: tv.nodes, vedges: tv.edges, layout: layeredLayout(tv.nodes, tv.edges), typeTotal: tv.total, typeShown: tv.nodes.length };
    }
    if (focusId) {
      const cap = focusExpanded ? Infinity : 40;
      const f = buildFocusView(nodes, edges, focusId, depth, direction, runtimeNames, observedPairs, cap);
      const layout = focusLayout(f.nodes);
      return { vnodes: f.nodes as ViewNode[], vedges: f.edges, layout, focusTotal: f.totalReachable, focusShown: f.nodes.length };
    }
    if (current.level === 'system') {
      const sys = buildSystemView(nodes, edges, runtimeNames);
      // Append TRACE's HydraDB intelligence layer as a real sink node.
      const vnodes = [...sys.nodes];
      const vedges = [...sys.edges];
      vnodes.push({
        id: 'hydradb',
        level: 'system',
        label: 'HydraDB',
        sublabel: storageMode?.isConnected ? 'connected · context layer' : (storageMode?.mode === 'HydraDB Cloud' ? 'configured' : 'local mode'),
        kind: 'HydraDB',
        incoming: sys.nodes.length,
        outgoing: 0,
      });
      for (const d of sys.nodes) {
        vedges.push({ from: d.id, to: 'hydradb', weight: 1, kind: 'hydra' });
      }
      const layout = laneLayout(vnodes);
      return { vnodes, vedges, layout };
    }
    if (current.level === 'module' && current.key) {
      const m = buildModuleView(nodes, edges, current.key);
      return { vnodes: m.nodes, vedges: m.edges, layout: layeredLayout(m.nodes, m.edges) };
    }
    if (current.level === 'file' && current.fileNode) {
      const fv = buildFileView(nodes, edges, current.fileNode, runtimeNames, observedPairs);
      return { vnodes: fv.nodes, vedges: fv.edges, layout: layeredLayout(fv.nodes, fv.edges) };
    }
    return { vnodes: [], vedges: [], layout: { pos: new Map(), width: 0, height: 0 } };
  }, [nodes, edges, current, focusId, depth, direction, runtimeNames, observedPairs, storageMode, focusExpanded, browseTab]);

  // Recompute the auto-fit scale whenever the canvas resizes or the layout
  // changes, so small graphs spread to fill the panel and huge ones shrink to fit.
  React.useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const compute = () => {
      if (!autoFitRef.current) return;
      const availW = el.clientWidth - 44;
      if (availW <= 0) return; // hidden / not laid out yet
      // Fit to WIDTH so the graph fills the panel horizontally (no dead space on
      // the sides) and scrolls vertically if tall. Never shrink below 100% — a
      // small graph should spread out, not sit tiny in the middle.
      const w = Math.max(view.layout.width, 600);
      let z = availW / w;
      z = Math.max(1, Math.min(z, 2));
      if (isFinite(z) && z > 0) setFitZoom(+z.toFixed(3));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, [view.layout.width, view.layout.height, autoFit]);

  const runtimeActiveDomains = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (['Function', 'Method', 'APIEndpoint'].includes(n.type) && runtimeNames.has(n.name)) {
        set.add(domainOfPath(n.filePath));
      }
    }
    return set;
  }, [nodes, runtimeNames]);

  const openNode = (vn: ViewNode) => {
    if (vn.id === 'hydradb') {
      setShowHydra(true);
      return;
    }
    if (vn.kind === 'domain') {
      const key = vn.id.replace('domain:', '');
      if (key === '__external__') return;
      setCrumbs([...crumbs, { level: 'module', key, label: domainLabel(key) }]);
      return;
    }
    if (vn.kind === 'File' && vn.ref) {
      setCrumbs([...crumbs, { level: 'file', fileNode: vn.ref, label: vn.label }]);
      return;
    }
    if (vn.ref) {
      // Symbol: enter focus and open the inspector.
      setFocusId(vn.ref.id);
      onSelectNode(vn.ref);
    }
  };

  const goToCrumb = (idx: number) => {
    setFocusId(null);
    setCrumbs(crumbs.slice(0, idx + 1));
  };

  // Live search suggestions for locating a node among many.
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as GraphNode[];
    const searchable = nodes.filter((n) => ['Function', 'Method', 'Class', 'APIEndpoint', 'File'].includes(n.type));
    const starts = searchable.filter((n) => n.name.toLowerCase().startsWith(q));
    const contains = searchable.filter((n) => !n.name.toLowerCase().startsWith(q) && (n.name.toLowerCase().includes(q) || (n.filePath || '').toLowerCase().includes(q)));
    return [...starts, ...contains].slice(0, 12);
  }, [search, nodes]);

  const pickSearch = (n: GraphNode) => {
    setBrowseTab('architecture');
    setFocusId(n.id);
    onSelectNode(n);
    setSearch('');
    setSearchOpen(false);
  };

  const insights = useMemo(() => {
    const symbols = nodes.filter((n) => ['Function', 'Method', 'APIEndpoint'].includes(n.type));
    const degree = (id: string) =>
      edges.filter((e) => (e.from === id || e.to === id) && e.type !== 'CONTAINS').length;
    let mostConnected: GraphNode | undefined;
    let maxDeg = -1;
    for (const s of symbols) {
      const d = degree(s.id);
      if (d > maxDeg) {
        maxDeg = d;
        mostConnected = s;
      }
    }
    const hotspot = symbols.find((s) => runtimeNames.has(s.name) && s.type !== 'APIEndpoint');
    return { mostConnected, maxDeg, hotspot };
  }, [nodes, edges, runtimeNames]);

  const pos = view.layout.pos;
  const focusMode = Boolean(focusId);

  // Current-location context (shown as a chip on the canvas since the breadcrumb
  // was replaced by back/home/forward — so drilling into a domain/file still
  // tells you where you are).
  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : undefined;
  const context: { label: string; kind: string; sub?: string } = focusMode
    ? { label: focusNode?.name || 'Focus', kind: focusNode?.type || 'Function', sub: 'Focus' }
    : browseTab === 'symbols'
    ? { label: 'All symbols', kind: 'domain', sub: 'Filter' }
    : browseTab === 'files'
    ? { label: 'All files', kind: 'File', sub: 'Filter' }
    : browseTab === 'modules'
    ? { label: 'All modules', kind: 'domain', sub: 'Filter' }
    : current.level === 'module'
    ? { label: current.label, kind: 'domain', sub: 'Module' }
    : current.level === 'file'
    ? { label: current.label, kind: 'File', sub: 'File' }
    : { label: 'System overview', kind: 'domain', sub: 'Architecture' };

  // Node label lookup + human-readable relationship text for edge tooltips.
  const labelById = new Map(view.vnodes.map((n) => [n.id, n.label]));
  const relationVerb = (kind: string): string => {
    switch (kind) {
      case 'CALLS':
        return 'calls';
      case 'EXPOSES':
        return 'exposes';
      case 'IMPORTS':
        return 'imports';
      case 'READS_SCHEMA':
        return 'reads from';
      case 'WRITES_SCHEMA':
        return 'writes to';
      case 'hydra':
        return 'context in';
      case 'domain':
        return 'depends on';
      default:
        return '→';
    }
  };
  const edgeText = (e: ViewEdge, observed: boolean): string => {
    const from = labelById.get(e.from) || e.from.replace(/^domain:/, '');
    const to = labelById.get(e.to) || e.to.replace(/^domain:/, '');
    return `${from} ${relationVerb(e.kind)} ${to}${observed ? ' · observed at runtime' : ''}`;
  };
  const animateEdges = view.vedges.length <= 140;

  // Export the current view as a self-contained SVG the user can open, print,
  // or share. Rebuilt from the same view-model the canvas renders.
  const exportSvg = () => {
    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const W = Math.max(view.layout.width, 600) + 40;
    const H = view.layout.height + 80;
    const OY = 40;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrains Mono, monospace">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    parts.push(`<text x="20" y="26" font-size="15" font-weight="700" fill="#0a0a0a" font-family="Plus Jakarta Sans, sans-serif">TRACE  ${esc(crumbs.map((c) => c.label).join(' / '))}${focusMode ? ' / Focus' : ''}</text>`);
    parts.push(`<text x="20" y="44" font-size="11" fill="#71717a">${view.vnodes.length} nodes  ${view.vedges.length} edges  ${esc(storageMode?.mode || 'Local')}</text>`);
    for (const e of view.vedges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const observed = Boolean(e.runtimeObserved);
      const sx = a.x + CARD_W / 2 + 20;
      const sy = a.y + CARD_H + 20 + OY;
      const tx = b.x + CARD_W / 2 + 20;
      const ty = b.y + 20 + OY;
      const midY = (sy + ty) / 2;
      parts.push(`<path d="M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}" fill="none" stroke="${observed ? '#059669' : '#c4c4c9'}" stroke-width="${observed ? 2.5 : 1.2}"/>`);
    }
    for (const vn of view.vnodes) {
      const p = pos.get(vn.id);
      if (!p) continue;
      const x = p.x + 20;
      const y = p.y + 20 + OY;
      const accent = kindAccent(vn.kind);
      parts.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="8" fill="#ffffff" stroke="#e6e6e9"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="4" height="${CARD_H}" rx="2" fill="${accent}"/>`);
      parts.push(`<text x="${x + 14}" y="${y + 26}" font-size="13" font-weight="700" fill="#0a0a0a">${esc(String(vn.label).slice(0, 26))}</text>`);
      parts.push(`<text x="${x + 14}" y="${y + 46}" font-size="11" fill="#71717a" font-family="Plus Jakarta Sans, sans-serif">${esc(String(vn.sublabel || vn.kind).slice(0, 30))}</text>`);
    }
    parts.push('</svg>');
    const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-architecture-${crumbs[crumbs.length - 1].level}${focusMode ? '-focus' : ''}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Context header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Architecture Explorer
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
            System architecture and dependencies
          </p>
        </div>
      </div>

      {/* Stat cards (left) + view mode (right) on one row — matching the reference. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 116px))', gap: '10px' }}>
          {[
            { label: 'Files', value: fileCount },
            { label: 'Symbols', value: symbolCount },
            { label: 'Relationships', value: relCount },
            { label: 'Domains', value: domainCount },
          ].map((s) => (
            <div key={s.label} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', background: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0a0a0a', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>View mode</span>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px' }}>
            {(['static', 'runtime', 'combined'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  background: viewMode === m ? 'var(--bg-tertiary)' : 'transparent',
                  color: viewMode === m ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                {m === 'runtime' ? 'Runtime activity' : m === 'combined' ? 'Combined' : 'Static'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Insight strip (real data only) */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {insights.mostConnected && (
          <button
            onClick={() => { setFocusId(insights.mostConnected!.id); onSelectNode(insights.mostConnected!); }}
            className="btn"
            style={{ fontSize: '12px' }}
          >
            <Activity size={14} style={{ color: '#0a0a0a' }} /> Most connected: <code>{insights.mostConnected.name}</code> ({insights.maxDeg})
          </button>
        )}
        {insights.hotspot && (
          <button
            onClick={() => { setFocusId(insights.hotspot!.id); onSelectNode(insights.hotspot!); }}
            className="btn"
            style={{ fontSize: '12px' }}
          >
            <Crosshair size={14} style={{ color: '#059669' }} /> Runtime hotspot: <code>{insights.hotspot.name}</code>
          </button>
        )}
      </div>

      {/* Sub-tab bar: Architecture / Modules / Files / Symbols + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
        {([
          ['architecture', 'Architecture', <Layers size={14} key="a" />],
          ['modules', 'Modules', <Boxes size={14} key="m" />],
          ['files', 'Files', <FileCode2 size={14} key="f" />],
          ['symbols', 'Symbols', <Activity size={14} key="s" />],
        ] as const).map(([id, label, icon]) => {
          const active = browseTab === id;
          return (
            <button
              key={id}
              onClick={() => { setBrowseTab(id); setFocusId(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: active ? 'var(--bg-tertiary)' : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? '#0a0a0a' : 'transparent'}`,
                borderRadius: '6px 6px 0 0',
                color: active ? '#0a0a0a' : 'var(--text-muted)',
                fontWeight: active ? 700 : 500,
                fontSize: '13px',
                padding: '8px 14px',
                marginBottom: '-3px',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: active ? '#0a0a0a' : 'var(--text-dim)', display: 'flex' }}>{icon}</span>
              {label}
            </button>
          );
        })}
        </div>
        <div style={{ position: 'relative', marginBottom: '3px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchMatches[0]) { pickSearch(searchMatches[0]); }
              if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); }
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search nodes…"
            style={{
              padding: '7px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              width: '230px',
            }}
          />
          {searchOpen && search.trim() && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                width: '320px',
                maxHeight: '300px',
                overflowY: 'auto',
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                zIndex: 50,
              }}
            >
              {searchMatches.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>No matching node.</div>
              ) : (
                searchMatches.map((n) => (
                  <button
                    key={n.id}
                    onMouseDown={(e) => { e.preventDefault(); pickSearch(n); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: kindAccent(n.type), display: 'flex', flexShrink: 0 }}>{kindIcon(n.type, 14)}</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{n.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'right' }}>{n.filePath || n.type}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend + focus controls on one row (controls sit to the right). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '18px', fontSize: '11px', color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#71717a" strokeWidth="1.5" /></svg>
            Static dependency
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#059669" strokeWidth="3" /></svg>
            Observed at runtime
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#71717a" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
            Persisted to HydraDB
          </span>
          <span style={{ color: 'var(--text-dim)' }}>Click a domain to drill in · click a symbol to focus</span>
        </div>
      </div>

      {/* Canvas (outer wrapper keeps the toolbar pinned while the graph scrolls) */}
      <div
        style={
          fullscreen
            ? { position: 'fixed', inset: 0, zIndex: 300, background: '#ffffff', padding: '14px', display: 'flex', flexDirection: 'column' }
            : { position: 'relative' }
        }
      >
        {/* Navigation pill (back / home / forward) on the canvas */}
        {nodes.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '14px',
              top: '14px',
              zIndex: 41,
              display: 'flex',
              gap: '2px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '9px',
              padding: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <button onClick={goBack} disabled={!canBack} title="Back" style={{ ...zoomBtn, opacity: canBack ? 1 : 0.3, cursor: canBack ? 'pointer' : 'default' }}><ArrowLeft size={17} strokeWidth={2.5} /></button>
            <button onClick={goHome} title="Back to full architecture" style={zoomBtn}><Home size={16} strokeWidth={2.5} /></button>
            <button onClick={goForward} disabled={!canForward} title="Forward" style={{ ...zoomBtn, opacity: canForward ? 1 : 0.3, cursor: canForward ? 'pointer' : 'default' }}><ArrowRight size={17} strokeWidth={2.5} /></button>
            {/* Current-location context chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 0 8px', marginLeft: '2px', borderLeft: '1px solid var(--border-subtle)', maxWidth: '260px' }}>
              <span style={{ color: kindAccent(context.kind), display: 'flex', flexShrink: 0 }}>{kindIcon(context.kind, 15)}</span>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{context.sub}</span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{context.label}</span>
              </div>
            </div>
          </div>
        )}

        {/* Vertical control stack (top-left, below the nav pill) */}
        {nodes.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '14px',
              top: '58px',
              zIndex: 40,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '9px',
              padding: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <button onClick={zoomIn} disabled={locked} title="Zoom in" style={{ ...zoomBtn, opacity: locked ? 0.4 : 1 }}><Plus size={15} /></button>
            <button onClick={zoomOut} disabled={locked} title="Zoom out" style={{ ...zoomBtn, opacity: locked ? 0.4 : 1 }}><Minus size={15} /></button>
            <button onClick={zoomReset} title="Reset / fit to view" style={{ ...zoomBtn, fontSize: '9px', fontFamily: 'JetBrains Mono, monospace' }}>{Math.round(effZoom * 100)}%</button>
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '1px 3px' }} />
            <button onClick={() => setFullscreen((f) => !f)} title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'} style={zoomBtn}>
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={() => setLocked((l) => !l)} title={locked ? 'Unlock zoom' : 'Lock zoom'} style={{ ...zoomBtn, color: locked ? '#0a0a0a' : 'var(--text-muted)', background: locked ? 'var(--bg-tertiary)' : 'transparent' }}>
              {locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          </div>
        )}

        {/* SVG export + focus filter (top-right) */}
        {nodes.length > 0 && (
          <div style={{ position: 'absolute', right: '14px', top: '14px', zIndex: 41, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            {focusMode && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFilter((v) => !v)}
                  title="Focus filters"
                  className="btn"
                  style={{ fontSize: '11px', padding: '6px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', background: showFilter ? 'var(--bg-tertiary)' : '#ffffff' }}
                >
                  <SlidersHorizontal size={13} /> Filter
                </button>
                {showFilter && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: '240px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>Direction</div>
                      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px' }}>
                        {(['dependents', 'both', 'dependencies'] as const).map((d) => (
                          <button key={d} onClick={() => setDirection(d)} style={{ flex: 1, padding: '5px 6px', fontSize: '11px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: direction === d ? 'var(--bg-tertiary)' : 'transparent', color: direction === d ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: direction === d ? 600 : 400 }}>
                            {d === 'dependents' ? 'In' : d === 'dependencies' ? 'Out' : 'Both'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>Depth</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 3].map((d) => (
                          <button key={d} onClick={() => setDepth(d)} style={{ flex: 1, height: '28px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', background: depth === d ? 'var(--accent)' : 'var(--bg-secondary)', color: depth === d ? '#fff' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    {((view as any).focusTotal > (view as any).focusShown || focusExpanded) && (
                      <button onClick={() => setFocusExpanded((v) => !v)} className="btn" style={{ fontSize: '12px', justifyContent: 'center' }}>
                        {focusExpanded ? 'Compact view' : `Show all ${(view as any).focusTotal} connected`}
                      </button>
                    )}
                    <button onClick={() => { setFocusId(null); setShowFilter(false); }} className="btn btn-primary" style={{ fontSize: '12px', justifyContent: 'center' }}>
                      <Layers size={14} /> Exit focus
                    </button>
                  </div>
                )}
              </div>
            )}
            <button onClick={exportSvg} title="Download this view as SVG (print-friendly)" className="btn" style={{ fontSize: '11px', padding: '6px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <Download size={13} /> SVG
            </button>
          </div>
        )}

        {/* Minimap — a scaled overview of the whole graph, bottom-left. */}
        {view.vnodes.length > 1 && (
          <div
            title="Graph overview"
            style={{
              position: 'absolute',
              left: '14px',
              bottom: '14px',
              zIndex: 40,
              width: '172px',
              height: '112px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              padding: '5px',
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox={`-10 -10 ${view.layout.width + 20} ${view.layout.height + 20}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {view.vedges.map((e, i) => {
                const a = view.layout.pos.get(e.from);
                const b = view.layout.pos.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x + CARD_W / 2}
                    y1={a.y + CARD_H / 2}
                    x2={b.x + CARD_W / 2}
                    y2={b.y + CARD_H / 2}
                    stroke={e.runtimeObserved ? '#059669' : '#d4d4d8'}
                    strokeWidth={e.runtimeObserved ? 4 : 2}
                  />
                );
              })}
              {view.vnodes.map((n) => {
                const p = view.layout.pos.get(n.id);
                if (!p) return null;
                const isTarget = focusMode && n.id === focusId;
                return (
                  <rect
                    key={n.id}
                    x={p.x}
                    y={p.y}
                    width={CARD_W}
                    height={CARD_H}
                    rx={8}
                    fill={isTarget ? '#0a0a0a' : n.runtimeActivity ? '#059669' : kindAccent(n.kind)}
                    stroke={isTarget ? '#0a0a0a' : 'none'}
                    strokeWidth={isTarget ? 6 : 0}
                  />
                );
              })}
            </svg>
          </div>
        )}
        <div
          ref={canvasScrollRef}
          className="card"
          style={{
            padding: 0,
            position: 'relative',
            overflow: 'auto',
            minHeight: '440px',
            maxHeight: fullscreen ? 'none' : 'calc(100vh - 320px)',
            flex: fullscreen ? 1 : undefined,
          }}
        >
        {/* Edge tooltip */}
        {edgeTip && (
          <div
            style={{
              position: 'fixed',
              left: `${edgeTip.x + 14}px`,
              top: `${edgeTip.y + 14}px`,
              zIndex: 60,
              pointerEvents: 'none',
              maxWidth: '320px',
              background: '#0a0a0a',
              color: '#ffffff',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              padding: '7px 10px',
              borderRadius: '7px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              lineHeight: 1.35,
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: edgeTip.observed ? '#34d399' : '#9a9aa2' }} />
            {edgeTip.text}
          </div>
        )}
        {view.vnodes.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No graph yet. Analyze a repository to populate the architecture.
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              // Use the graph's natural width so a small graph (bands + a single
              // card per lane) centers as one group instead of hugging the left
              // of a forced-wide canvas. margin:auto then centers it in the panel.
              width: `${view.layout.width}px`,
              height: `${view.layout.height + 40}px`,
              margin: '0 auto',
              padding: '20px',
              zoom: effZoom,
              backgroundImage:
                'linear-gradient(rgba(161, 161, 170,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(161, 161, 170,0.06) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          >
            {/* Swim-lane bands (system overview) */}
            {'bands' in view.layout &&
              (view.layout as any).bands.map((band: { label: string; y: number; height: number }, i: number) => (
                <div
                  key={`band-${i}`}
                  style={{
                    position: 'absolute',
                    left: '20px',
                    right: '20px',
                    top: `${band.y + 20}px`,
                    height: `${band.height}px`,
                    border: '1px dashed var(--border-color)',
                    borderRadius: '10px',
                    background: 'rgba(161, 161, 170,0.03)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      left: '12px',
                      fontSize: '10px',
                      letterSpacing: '0.14em',
                      fontFamily: 'JetBrains Mono, monospace',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {band.label}
                  </span>
                </div>
              ))}
            {/* Edges */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#71717a" />
                </marker>
                <marker id="arrow-rt" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#059669" />
                </marker>
                <marker id="arrow-hi" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#0a0a0a" />
                </marker>
              </defs>
              {view.vedges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const observed = Boolean(e.runtimeObserved);
                if (viewMode === 'runtime' && !observed && e.kind !== 'hydra') return null;
                const dim = viewMode === 'runtime' && !observed;
                const isHydra = e.kind === 'hydra';
                const hovered = hoverEdgeIdx === i;
                // Edges touching the focused or hovered node are emphasised so a
                // developer can visually trace a symbol's connections.
                const connected =
                  (!!focusId && (e.from === focusId || e.to === focusId)) ||
                  (!!hoverNodeId && (e.from === hoverNodeId || e.to === hoverNodeId));
                const sx = a.x + CARD_W / 2 + 20;
                const sy = a.y + CARD_H + 20;
                const tx = b.x + CARD_W / 2 + 20;
                const ty = b.y + 20;
                const midY = (sy + ty) / 2;
                const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
                const stroke = hovered ? '#0a0a0a' : observed ? '#059669' : connected ? '#3f3f46' : '#9a9aa2';
                const sw = hovered ? (observed ? 4 : 3) : connected ? (observed ? 3.5 : 2.5) : observed ? 3 : 1.5;
                const flowClass = animateEdges && !dim ? (isHydra ? 'edge-flow-hydra' : 'edge-flow') : undefined;
                return (
                  <g key={i}>
                    {/* wide invisible hit area for hover */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ pointerEvents: 'stroke', cursor: 'help' }}
                      onMouseMove={(ev) => {
                        setHoverEdgeIdx(i);
                        setEdgeTip({ x: ev.clientX, y: ev.clientY, text: edgeText(e, observed), observed });
                      }}
                      onMouseLeave={() => {
                        setHoverEdgeIdx((cur) => (cur === i ? null : cur));
                        setEdgeTip(null);
                      }}
                    />
                    {/* visible animated edge */}
                    <path
                      className={hovered ? undefined : flowClass}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={sw}
                      strokeDasharray={hovered && !isHydra ? undefined : isHydra ? '4 5' : undefined}
                      opacity={dim ? 0.12 : hovered || connected ? 1 : isHydra ? 0.55 : 0.8}
                      markerEnd={hovered ? 'url(#arrow-hi)' : observed ? 'url(#arrow-rt)' : 'url(#arrow)'}
                      style={{ pointerEvents: 'none', transition: 'stroke-width 0.12s ease' }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {view.vnodes.map((vn) => {
              const p = pos.get(vn.id);
              if (!p) return null;
              const accent = kindAccent(vn.kind);
              const runtimeActive =
                vn.kind === 'domain'
                  ? runtimeActiveDomains.has(vn.id.replace('domain:', ''))
                  : Boolean(vn.runtimeActivity);
              const faded = viewMode === 'runtime' && !runtimeActive && vn.kind !== 'HydraDB';
              // Health colouring: in Runtime/Combined views, code that actually
              // executed is healthy (green, blinking) and code with no runtime
              // evidence is a blind spot (amber). Static view stays neutral so it
              // isn't a wall of colour.
              const showHealth = viewMode !== 'static' && vn.kind !== 'domain' && vn.kind !== 'HydraDB';
              const healthy = showHealth && runtimeActive;
              const blindSpot = showHealth && !runtimeActive;
              const accentColor = healthy ? '#059669' : blindSpot ? '#d97706' : accent;
              const isFocusTarget = focusMode && vn.id === focusId;
              const hovered = hoverNodeId === vn.id;
              const isOpenable = vn.kind === 'domain' || vn.kind === 'File';
              const isSymbol = Boolean(vn.ref) && vn.kind !== 'domain' && vn.kind !== 'File' && vn.kind !== 'HydraDB';
              const elevated = hovered || isFocusTarget;
              return (
                <div
                  key={vn.id}
                  onClick={() => openNode(vn)}
                  onMouseEnter={() => setHoverNodeId(vn.id)}
                  onMouseLeave={() => setHoverNodeId((cur) => (cur === vn.id ? null : cur))}
                  style={{
                    position: 'absolute',
                    left: `${p.x + 20}px`,
                    top: `${p.y + 20}px`,
                    width: `${CARD_W}px`,
                    minHeight: `${CARD_H}px`,
                    background: isFocusTarget ? '#f2f2f3' : hovered ? '#fafafa' : 'var(--bg-secondary)',
                    border: isFocusTarget ? '2px solid #0a0a0a' : `1px solid ${hovered ? accentColor : blindSpot ? 'rgba(217,119,6,0.4)' : 'var(--border-color)'}`,
                    borderLeft: `${isFocusTarget ? 5 : 3}px solid ${accentColor}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    boxShadow: isFocusTarget
                      ? '0 0 0 3px rgba(10,10,10,0.16), 0 6px 16px rgba(0,0,0,0.14)'
                      : hovered
                      ? '0 6px 16px rgba(0,0,0,0.12)'
                      : '0 1px 2px rgba(0,0,0,0.06)',
                    opacity: faded ? 0.28 : 1,
                    zIndex: elevated ? 25 : 1,
                    transition: 'opacity 0.2s, box-shadow 0.15s, border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: accentColor, display: 'flex' }}>{kindIcon(vn.kind)}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {vn.label}
                    </span>
                    {healthy && (
                      <span className="pulse" title="Healthy — observed at runtime" style={{ marginLeft: 'auto', width: '9px', height: '9px', borderRadius: '50%', background: '#059669', boxShadow: '0 0 0 3px rgba(5,150,105,0.18)', flexShrink: 0 }} />
                    )}
                    {blindSpot && (
                      <span title="Blind spot — no runtime evidence" style={{ marginLeft: 'auto', width: '9px', height: '9px', borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
                    )}
                    {!showHealth && runtimeActive && vn.kind !== 'HydraDB' && (
                      <span title="observed at runtime" style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        marginLeft: healthy || blindSpot || (runtimeActive && vn.kind !== 'HydraDB') ? '0' : 'auto',
                        fontSize: '9px',
                        letterSpacing: '0.08em',
                        color: accent,
                        border: `1px solid ${accent}55`,
                        borderRadius: '3px',
                        padding: '1px 4px',
                        fontFamily: 'JetBrains Mono, monospace',
                        flexShrink: 0,
                      }}
                    >
                      {typeTag(vn.kind)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: isFocusTarget ? '#0a0a0a' : 'var(--text-muted)', fontWeight: isFocusTarget ? 700 : 400, marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ textTransform: vn.kind === 'domain' ? 'none' : 'capitalize' }}>{vn.sublabel || vn.kind}</span>
                    {(vn.kind === 'domain') && (
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-dim)' }}>
                        {vn.incoming + vn.outgoing} conns <ArrowRight size={11} />
                      </span>
                    )}
                  </div>

                  {/* Hover actions */}
                  {hovered && (
                    <div style={{ position: 'absolute', right: '8px', bottom: '-13px', display: 'flex', gap: '6px', zIndex: 40 }}>
                      {isOpenable && (
                        <button style={nodeActionBtn(false)} onClick={(ev) => { ev.stopPropagation(); openNode(vn); }}>
                          Open
                        </button>
                      )}
                      {isSymbol && (
                        <>
                          <button
                            style={nodeActionBtn(false)}
                            onClick={(ev) => { ev.stopPropagation(); if (vn.ref) { setFocusId(vn.ref.id); onSelectNode(vn.ref); } }}
                          >
                            Focus
                          </button>
                          {onAnalyzeImpact && (
                            <button
                              style={nodeActionBtn(true)}
                              onClick={(ev) => { ev.stopPropagation(); if (vn.ref) onAnalyzeImpact(vn.ref); }}
                            >
                              Impact
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
        {fullscreen && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 0', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
            <span>{view.vnodes.length} nodes · {view.vedges.length} edges · press Esc to exit full screen</span>
            <button onClick={() => setFullscreen(false)} className="btn" style={{ fontSize: '12px', padding: '5px 12px' }}>Exit full screen</button>
          </div>
        )}
      </div>

      {/* Drawing metadata strip */}
      <div style={{ display: 'flex', gap: '18px', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', flexWrap: 'wrap' }}>
        <span>DRAWING · ARCH-01</span>
        <span>VIEW · {focusMode ? 'FOCUS' : current.level.toUpperCase()}</span>
        <span>MODE · {storageMode?.mode === 'HydraDB Cloud' ? 'CLOUD' : 'LOCAL'}</span>
        <span>NODES · {view.vnodes.length}</span>
        <span>EDGES · {view.vedges.length}</span>
        <span>LAYOUT · {autoFit ? 'AUTO' : 'MANUAL'}{locked ? ' · LOCKED' : ''}</span>
      </div>

      {/* HydraDB intelligence inspector */}
      {showHydra && (
        <HydraPanel
          storageMode={storageMode}
          nodes={nodes}
          edges={edges}
          tracesCount={traces.length}
          onClose={() => setShowHydra(false)}
        />
      )}
    </div>
  );
};

const HydraPanel: React.FC<{
  storageMode?: StorageModeInfo;
  nodes: GraphNode[];
  edges: GraphEdge[];
  tracesCount: number;
  onClose: () => void;
}> = ({ storageMode, nodes, edges, tracesCount, onClose }) => {
  const symbolDocs = nodes.filter((n) => ['Function', 'Method', 'APIEndpoint'].includes(n.type)).length;
  const rows: { label: string; value: string }[] = [
    { label: 'Storage mode', value: storageMode?.mode || 'Local' },
    { label: 'Connection', value: storageMode?.isConnected ? 'Connected (verified request)' : storageMode?.status || 'Offline' },
    { label: 'Database', value: storageMode?.database || 'local' },
    { label: 'SDK', value: storageMode?.sdkPackage || 'internal' },
    { label: 'Repository snapshots', value: '1 (current)' },
    { label: 'Symbol context documents', value: `${symbolDocs}` },
    { label: 'Code graph nodes', value: `${nodes.length}` },
    { label: 'Code graph relationships', value: `${edges.length}` },
    { label: 'Runtime traces', value: `${tracesCount}` },
  ];
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '440px', maxWidth: '92vw', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-tertiary)' }}>
          <Server size={20} style={{ color: '#71717a' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)' }}>HydraDB · engineering intelligence layer</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>What TRACE persists and retrieves</span>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0 }}>
            TRACE ingests per-symbol context into HydraDB and queries it for relevant engineering context. HydraDB also
            builds a knowledge graph over that context, complementing TRACE's deterministic local graph.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                <span style={{ color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BrowseList — Modules / Files / Symbols tabs. Real data, searchable, clickable.
// ---------------------------------------------------------------------------
interface BrowseListProps {
  kind: 'modules' | 'files' | 'symbols';
  nodes: GraphNode[];
  edges: GraphEdge[];
  runtimeNames: Set<string>;
  onSelect: (n: GraphNode) => void;
  onFocus: (n: GraphNode) => void;
  onOpenDomain: (key: string, label: string) => void;
}

const BrowseList: React.FC<BrowseListProps> = ({ kind, nodes, edges, runtimeNames, onSelect, onFocus, onOpenDomain }) => {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const degreeOf = (id: string) => edges.filter((e) => e.from === id || e.to === id).length;

  let rows: { id: string; name: string; meta: string; kind: string; runtime: boolean; onClick: () => void }[] = [];

  if (kind === 'modules') {
    const domains = new Map<string, { files: number; symbols: number }>();
    for (const n of nodes) {
      if (n.type === 'File') {
        const key = (n.filePath || n.name || '').split('/')[0] || 'root';
        const d = domains.get(key) || { files: 0, symbols: 0 };
        d.files++;
        domains.set(key, d);
      }
    }
    for (const n of nodes) {
      if (['Function', 'Method', 'Class', 'APIEndpoint'].includes(n.type)) {
        const key = (n.filePath || '').split('/')[0] || 'root';
        const d = domains.get(key);
        if (d) d.symbols++;
      }
    }
    rows = [...domains.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, d]) => ({
        id: key,
        name: domainLabel(key),
        meta: `${d.files} files · ${d.symbols} symbols`,
        kind: 'domain',
        runtime: false,
        onClick: () => onOpenDomain(key, domainLabel(key)),
      }));
  } else if (kind === 'files') {
    rows = nodes
      .filter((n) => n.type === 'File')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((n) => ({
        id: n.id,
        name: n.name || n.filePath || '(file)',
        meta: `${degreeOf(n.id)} connections`,
        kind: 'File',
        runtime: false,
        onClick: () => onSelect(n),
      }));
  } else {
    rows = nodes
      .filter((n) => ['Function', 'Method', 'Class', 'APIEndpoint'].includes(n.type))
      .sort((a, b) => degreeOf(b.id) - degreeOf(a.id))
      .map((n) => ({
        id: n.id,
        name: n.name || '(symbol)',
        meta: `${n.filePath || 'internal'}${n.startLine ? `:${n.startLine}` : ''}`,
        kind: n.type,
        runtime: runtimeNames.has(n.name),
        onClick: () => onFocus(n),
      }));
  }

  const filtered = query ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.meta.toLowerCase().includes(query)) : rows;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0a0a0a', textTransform: 'capitalize' }}>{kind} · {filtered.length}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${kind}…`}
          style={{ padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-main)', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', width: '220px' }}
        />
      </div>
      <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No {kind} found.</div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              onClick={r.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', padding: '11px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: kindAccent(r.kind), display: 'flex', flexShrink: 0 }}>{kindIcon(r.kind, 16)}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{r.name}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.meta}</span>
              {r.runtime && <span title="observed at runtime" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#059669', flexShrink: 0 }} />}
              <ChevronRight size={15} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
            </button>
          ))
        )}
      </div>
    </div>
  );
};
