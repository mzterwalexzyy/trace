import { GraphNode, GraphEdge } from '../../core/hydradb/types.js';

/**
 * View-model transforms for the Architecture Explorer.
 *
 * These functions aggregate the raw TRACE graph (files, symbols, endpoints and
 * their relationships) into progressively-disclosed levels: system domains,
 * files within a domain, and symbols within a file. Nothing here fabricates
 * data; every count and relationship is derived from the real analyzed graph.
 */

export type ViewLevel = 'system' | 'module' | 'file' | 'symbol';

export interface ViewNode {
  id: string;
  level: ViewLevel;
  label: string;
  sublabel?: string;
  kind: string; // domain | File | Function | APIEndpoint | DBSchema | External | HydraDB
  incoming: number;
  outgoing: number;
  fileCount?: number;
  symbolCount?: number;
  runtimeActivity?: number;
  external?: boolean;
  ref?: GraphNode; // underlying node when this maps 1:1
}

export interface ViewEdge {
  from: string;
  to: string;
  weight: number;
  kind: string; // CALLS | EXPOSES | IMPORTS | READS_SCHEMA | WRITES_SCHEMA | domain
  runtimeObserved?: boolean;
}

const SYMBOL_TYPES = new Set(['Function', 'Method', 'Class', 'APIEndpoint']);

const DOMAIN_NAMES: Record<string, string> = {
  db: 'Database',
  handlers: 'Handlers',
  services: 'Services',
  trace: 'Tracing',
  root: 'Entry',
  web: 'Frontend',
  components: 'Components',
  server: 'Server',
  core: 'Core',
  cli: 'CLI',
  api: 'API',
  auth: 'Authentication',
  utils: 'Utilities',
  routes: 'Routes',
  models: 'Models',
  controllers: 'Controllers',
};

export function domainLabel(key: string): string {
  return DOMAIN_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/** Assign a file path to an architectural domain (top-level meaningful dir). */
export function domainOfPath(relPath: string | undefined): string {
  if (!relPath) return 'root';
  let parts = relPath.split('/').filter(Boolean);
  if (parts[0] === 'src') parts = parts.slice(1);
  if (parts.length > 1) return parts[0];
  return 'root';
}

function isBareSpecifier(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('/');
}

/** Names of every function/endpoint observed in the recorded runtime traces. */
export function runtimeActiveNames(traces: { spans: GraphNode[] }[]): Set<string> {
  const names = new Set<string>();
  for (const t of traces) {
    for (const s of t.spans) {
      const n = s.metadata?.functionName || s.name;
      if (n) names.add(n);
    }
  }
  return names;
}

/**
 * Parent->child function pairs actually observed at runtime, reconstructed from
 * each trace's span tree (using the depth ordering). Used to mark which static
 * edges were genuinely exercised.
 */
export function runtimeObservedPairs(traces: { spans: GraphNode[] }[]): Set<string> {
  const pairs = new Set<string>();
  for (const t of traces) {
    const stack: { name: string; depth: number }[] = [];
    for (const s of t.spans) {
      const depth = typeof s.metadata?.depth === 'number' ? s.metadata.depth : 0;
      const name = s.metadata?.functionName || s.name;
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      if (stack.length) pairs.add(`${stack[stack.length - 1].name}->${name}`);
      stack.push({ name, depth });
    }
  }
  return pairs;
}

export interface SystemView {
  domains: { key: string; label: string; fileCount: number; symbolCount: number; connections: number }[];
  nodes: ViewNode[];
  edges: ViewEdge[];
}

/** Build the top-level system overview: architectural domains + aggregated edges. */
export function buildSystemView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  runtimeNames: Set<string>
): SystemView {
  const fileToDomain = new Map<string, string>();
  const domainFiles = new Map<string, Set<string>>();
  const domainSymbols = new Map<string, number>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (n.type === 'File') {
      const d = domainOfPath(n.filePath || n.name);
      fileToDomain.set(n.id, d);
      if (!domainFiles.has(d)) domainFiles.set(d, new Set());
      domainFiles.get(d)!.add(n.id);
    }
  }
  for (const n of nodes) {
    if (SYMBOL_TYPES.has(n.type)) {
      const d = domainOfPath(n.filePath);
      domainSymbols.set(d, (domainSymbols.get(d) || 0) + 1);
    }
  }

  const domainOfNode = (n: GraphNode): string => {
    if (n.type === 'File') return fileToDomain.get(n.id) || domainOfPath(n.name);
    return domainOfPath(n.filePath);
  };

  // Aggregate cross-domain edges.
  const edgeWeights = new Map<string, number>();
  let hasExternal = false;
  for (const e of edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) continue;
    if (e.type === 'CONTAINS') continue;
    if (to.type === 'Module') {
      if (isBareSpecifier(to.name)) {
        const d = domainOfNode(from);
        hasExternal = true;
        const key = `${d}=>__external__`;
        edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
      }
      continue;
    }
    const df = domainOfNode(from);
    const dt = domainOfNode(to);
    if (df === dt) continue;
    const key = `${df}=>${dt}`;
    edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
  }

  const domainKeys = Array.from(domainFiles.keys()).sort();
  const domains = domainKeys.map((key) => {
    let connections = 0;
    for (const [k, w] of edgeWeights) {
      if (k.startsWith(`${key}=>`) || k.endsWith(`=>${key}`)) connections += w;
    }
    return {
      key,
      label: domainLabel(key),
      fileCount: domainFiles.get(key)!.size,
      symbolCount: domainSymbols.get(key) || 0,
      connections,
    };
  });

  const viewNodes: ViewNode[] = domains.map((d) => ({
    id: `domain:${d.key}`,
    level: 'system',
    label: d.label,
    sublabel: `${d.fileCount} files · ${d.symbolCount} symbols`,
    kind: 'domain',
    incoming: 0,
    outgoing: 0,
    fileCount: d.fileCount,
    symbolCount: d.symbolCount,
  }));

  if (hasExternal) {
    viewNodes.push({
      id: 'domain:__external__',
      level: 'system',
      label: 'External Packages',
      sublabel: 'third-party dependencies',
      kind: 'External',
      incoming: 0,
      outgoing: 0,
      external: true,
    });
  }

  const viewEdges: ViewEdge[] = [];
  for (const [k, w] of edgeWeights) {
    const [df, dt] = k.split('=>');
    viewEdges.push({ from: `domain:${df}`, to: `domain:${dt}`, weight: w, kind: 'domain' });
  }

  // Count incoming/outgoing per domain node for labels.
  const nodeMap = new Map(viewNodes.map((n) => [n.id, n]));
  for (const e of viewEdges) {
    nodeMap.get(e.from) && (nodeMap.get(e.from)!.outgoing += e.weight);
    nodeMap.get(e.to) && (nodeMap.get(e.to)!.incoming += e.weight);
  }

  return { domains, nodes: viewNodes, edges: viewEdges };
}

/** Files within a domain, plus import/call edges between them. */
export function buildModuleView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  domainKey: string
): { nodes: ViewNode[]; edges: ViewEdge[] } {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const files = nodes.filter((n) => n.type === 'File' && domainOfPath(n.filePath || n.name) === domainKey);
  const fileIds = new Set(files.map((f) => f.id));

  // Map a symbol to its file node id.
  const symbolFile = new Map<string, string>();
  for (const n of nodes) {
    if (SYMBOL_TYPES.has(n.type) || n.type === 'DBSchema') {
      const file = files.find((f) => (f.filePath || f.name) === n.filePath);
      if (file) symbolFile.set(n.id, file.id);
    }
  }

  const viewNodes: ViewNode[] = files.map((f) => {
    const symbolCount = nodes.filter((n) => SYMBOL_TYPES.has(n.type) && n.filePath === (f.filePath || f.name)).length;
    return {
      id: f.id,
      level: 'module',
      label: (f.filePath || f.name).split('/').pop() || f.name,
      sublabel: `${symbolCount} symbols`,
      kind: 'File',
      incoming: 0,
      outgoing: 0,
      symbolCount,
      ref: f,
    };
  });

  const edgeWeights = new Map<string, number>();
  const fileOf = (id: string): string | undefined => {
    if (fileIds.has(id)) return id;
    return symbolFile.get(id);
  };
  for (const e of edges) {
    if (e.type === 'CONTAINS') continue;
    const from = fileOf(e.from);
    const to = fileOf(e.to);
    if (!from || !to || from === to) continue;
    if (!fileIds.has(from) || !fileIds.has(to)) continue;
    const key = `${from}=>${to}`;
    edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
  }

  const viewEdges: ViewEdge[] = Array.from(edgeWeights.entries()).map(([k, w]) => {
    const [from, to] = k.split('=>');
    return { from, to, weight: w, kind: 'IMPORTS' };
  });
  void nodeById;
  return { nodes: viewNodes, edges: viewEdges };
}

/** Symbols within a file plus their immediate neighbours across the codebase. */
export function buildFileView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fileNode: GraphNode,
  runtimeNames: Set<string>,
  observedPairs: Set<string>
): { nodes: ViewNode[]; edges: ViewEdge[] } {
  const relPath = fileNode.filePath || fileNode.name;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const localSymbols = nodes.filter((n) => (SYMBOL_TYPES.has(n.type) || n.type === 'DBSchema') && n.filePath === relPath);
  const localIds = new Set(localSymbols.map((s) => s.id));

  const included = new Map<string, GraphNode>();
  for (const s of localSymbols) included.set(s.id, s);

  const relevant: GraphEdge[] = [];
  for (const e of edges) {
    if (e.type === 'CONTAINS' || e.type === 'IMPORTS') continue;
    const touchesLocal = localIds.has(e.from) || localIds.has(e.to);
    if (!touchesLocal) continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) continue;
    if (to.type === 'Module') continue;
    included.set(from.id, from);
    included.set(to.id, to);
    relevant.push(e);
  }

  const viewNodes: ViewNode[] = Array.from(included.values()).map((n) => ({
    id: n.id,
    level: 'symbol',
    label: n.name,
    sublabel: n.type === 'DBSchema' ? 'db operation' : localIds.has(n.id) ? n.type : `${n.type} · ${(n.filePath || '').split('/').pop() || 'external'}`,
    kind: n.type,
    incoming: 0,
    outgoing: 0,
    external: !localIds.has(n.id),
    runtimeActivity: runtimeNames.has(n.name) ? 1 : 0,
    ref: n,
  }));

  const viewEdges: ViewEdge[] = relevant.map((e) => {
    const fromN = nodeById.get(e.from)!;
    const toN = nodeById.get(e.to)!;
    return {
      from: e.from,
      to: e.to,
      weight: 1,
      kind: e.type,
      runtimeObserved: observedPairs.has(`${fromN.name}->${toN.name}`),
    };
  });

  return { nodes: viewNodes, edges: viewEdges };
}

/**
 * Focus neighbourhood around one symbol: dependents (callers, inbound) and
 * dependencies (callees, outbound) expanded to `depth` hops.
 */
export function buildFocusView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetId: string,
  depth: number,
  direction: 'both' | 'dependencies' | 'dependents',
  runtimeNames: Set<string>,
  observedPairs: Set<string>,
  maxNodes: number = Infinity
): { nodes: (ViewNode & { column: number })[]; edges: ViewEdge[]; totalReachable: number } {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const target = nodeById.get(targetId);
  if (!target) return { nodes: [], edges: [], totalReachable: 0 };

  const callerEdges = edges.filter((e) => ['CALLS', 'EXPOSES'].includes(e.type));
  const calleeEdges = edges.filter((e) => ['CALLS', 'EXPOSES', 'READS_SCHEMA', 'WRITES_SCHEMA'].includes(e.type));

  const column = new Map<string, number>([[targetId, 0]]);
  const usedEdges: GraphEdge[] = [];

  if (direction !== 'dependents') {
    // Dependencies: follow outbound edges (things this calls).
    let frontier = [targetId];
    for (let d = 1; d <= depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of calleeEdges.filter((x) => x.from === id)) {
          if (!nodeById.get(e.to)) continue;
          if (nodeById.get(e.to)!.type === 'Module') continue;
          usedEdges.push(e);
          if (!column.has(e.to)) {
            column.set(e.to, d);
            next.push(e.to);
          }
        }
      }
      frontier = next;
    }
  }

  if (direction !== 'dependencies') {
    // Dependents: follow inbound edges (things that call this).
    let frontier = [targetId];
    for (let d = 1; d <= depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of callerEdges.filter((x) => x.to === id)) {
          if (!nodeById.get(e.from)) continue;
          usedEdges.push(e);
          if (!column.has(e.from)) {
            column.set(e.from, -d);
            next.push(e.from);
          }
        }
      }
      frontier = next;
    }
  }

  // Cap the number of nodes for a compact default view. Keep the target, then
  // prefer the closest (smallest depth) and most-connected neighbours so the
  // most relevant structure survives; the rest are available via "show all".
  const totalReachable = column.size;
  let keptIds = new Set(column.keys());
  if (column.size > maxNodes) {
    const degree = new Map<string, number>();
    for (const e of usedEdges) {
      degree.set(e.from, (degree.get(e.from) || 0) + 1);
      degree.set(e.to, (degree.get(e.to) || 0) + 1);
    }
    const ranked = Array.from(column.entries())
      .filter(([id]) => id !== targetId)
      .sort((a, b) => {
        const da = Math.abs(a[1]);
        const db = Math.abs(b[1]);
        if (da !== db) return da - db; // closer first
        return (degree.get(b[0]) || 0) - (degree.get(a[0]) || 0); // then more-connected
      })
      .slice(0, Math.max(0, maxNodes - 1))
      .map(([id]) => id);
    keptIds = new Set([targetId, ...ranked]);
    for (const id of Array.from(column.keys())) {
      if (!keptIds.has(id)) column.delete(id);
    }
  }

  const viewNodes = Array.from(column.entries()).map(([id, col]) => {
    const n = nodeById.get(id)!;
    return {
      id,
      level: 'symbol' as ViewLevel,
      label: n.name,
      sublabel: id === targetId ? 'selected' : n.type,
      kind: n.type,
      incoming: 0,
      outgoing: 0,
      column: col,
      external: id !== targetId,
      runtimeActivity: runtimeNames.has(n.name) ? 1 : 0,
      ref: n,
    };
  });

  const seen = new Set<string>();
  const viewEdges: ViewEdge[] = [];
  for (const e of usedEdges) {
    const key = `${e.from}=>${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!column.has(e.from) || !column.has(e.to)) continue;
    const fromN = nodeById.get(e.from)!;
    const toN = nodeById.get(e.to)!;
    viewEdges.push({
      from: e.from,
      to: e.to,
      weight: 1,
      kind: e.type,
      runtimeObserved: observedPairs.has(`${fromN.name}->${toN.name}`),
    });
  }

  return { nodes: viewNodes, edges: viewEdges, totalReachable };
}

/**
 * Type-filtered graph view for the Files / Symbols sub-tabs: keeps only nodes of
 * the requested kind and the edges between them, so the panel stays a GRAPH (not
 * a list). Capped to the most-connected N so a huge repo stays renderable.
 */
export function buildTypeView(
  nodes: GraphNode[],
  edges: GraphEdge[],
  kind: 'files' | 'symbols',
  runtimeNames: Set<string>,
  observedPairs: Set<string>,
  cap: number = 80
): { nodes: ViewNode[]; edges: ViewEdge[]; total: number } {
  const wantFiles = kind === 'files';
  const pool = nodes.filter((n) => (wantFiles ? n.type === 'File' : SYMBOL_TYPES.has(n.type)));

  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
    deg.set(e.to, (deg.get(e.to) || 0) + 1);
  }

  const kept = [...pool]
    .sort((a, b) => {
      const d = (deg.get(b.id) || 0) - (deg.get(a.id) || 0);
      return d !== 0 ? d : (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, cap);
  const keptIds = new Set(kept.map((n) => n.id));

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const viewNodes: ViewNode[] = kept.map((n) => ({
    id: n.id,
    level: wantFiles ? ('file' as ViewLevel) : ('symbol' as ViewLevel),
    label: n.name,
    sublabel: n.type,
    kind: n.type,
    incoming: 0,
    outgoing: 0,
    runtimeActivity: runtimeNames.has(n.name) ? 1 : 0,
    external: false,
    ref: n,
  }));

  const seen = new Set<string>();
  const viewEdges: ViewEdge[] = [];
  for (const e of edges) {
    if (!keptIds.has(e.from) || !keptIds.has(e.to) || e.from === e.to) continue;
    const key = `${e.from}=>${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fromN = nodeById.get(e.from)!;
    const toN = nodeById.get(e.to)!;
    viewEdges.push({
      from: e.from,
      to: e.to,
      weight: 1,
      kind: e.type,
      runtimeObserved: observedPairs.has(`${fromN.name}->${toN.name}`),
    });
  }

  return { nodes: viewNodes, edges: viewEdges, total: pool.length };
}
