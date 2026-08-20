import * as fs from 'fs';
import * as path from 'path';
import {
  GraphNode,
  GraphEdge,
  HydraGraphState,
  EdgeType,
  TraversalResult,
  GraphPath,
} from '../types.js';
import {
  IHydraDBDriver,
  StorageModeInfo,
  HydraDBContextQueryResult,
} from '../interface.js';

export class LocalHydraDB implements IHydraDBDriver {
  private dbPath: string;
  private state: HydraGraphState;

  constructor(options?: { dbPath?: string }) {
    const baseDir = options?.dbPath ? path.dirname(options.dbPath) : path.join(process.cwd(), '.trace');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.dbPath = options?.dbPath || path.join(baseDir, 'hydradb_graph.json');
    this.state = this.loadState();
  }

  public getStorageModeInfo(): StorageModeInfo {
    return {
      mode: 'Local',
      status: 'Offline',
      isConnected: false,
      database: 'local_file',
      sdkPackage: 'Internal Graph Engine',
    };
  }

  private loadState(): HydraGraphState {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        // Fallback
      }
    }
    return {
      version: '1.0.0',
      commitSha: 'HEAD',
      snapshotId: `snap_${Date.now()}`,
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
    };
  }

  public saveState(): void {
    this.state.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.dbPath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  public clear(): void {
    this.state.nodes = [];
    this.state.edges = [];
    this.saveState();
  }

  public setSnapshotMetadata(commitSha: string, snapshotId: string): void {
    this.state.commitSha = commitSha;
    this.state.snapshotId = snapshotId;
    this.saveState();
  }

  public getSnapshotId(): string {
    return this.state.snapshotId;
  }

  public upsertNode(nodeInput: Omit<GraphNode, 'createdAt'> & { createdAt?: string }): GraphNode {
    const existingIndex = this.state.nodes.findIndex((n) => n.id === nodeInput.id);
    const node: GraphNode = {
      ...nodeInput,
      createdAt: nodeInput.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.state.nodes[existingIndex] = {
        ...this.state.nodes[existingIndex],
        ...node,
      };
      return this.state.nodes[existingIndex];
    } else {
      this.state.nodes.push(node);
      return node;
    }
  }

  public addEdge(edgeInput: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): GraphEdge {
    const id = edgeInput.id || `edge_${edgeInput.from}_${edgeInput.type}_${edgeInput.to}`;
    const existingIndex = this.state.edges.findIndex((e) => e.id === id || (e.from === edgeInput.from && e.to === edgeInput.to && e.type === edgeInput.type));

    const edge: GraphEdge = {
      id,
      from: edgeInput.from,
      to: edgeInput.to,
      type: edgeInput.type,
      metadata: edgeInput.metadata || {},
      createdAt: edgeInput.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.state.edges[existingIndex] = edge;
      return edge;
    } else {
      this.state.edges.push(edge);
      return edge;
    }
  }

  public getNode(id: string): GraphNode | undefined {
    return this.state.nodes.find((n) => n.id === id);
  }

  public findNodes(predicate: (node: GraphNode) => boolean): GraphNode[] {
    return this.state.nodes.filter(predicate);
  }

  public findNodesByNameOrSymbol(query: string): GraphNode[] {
    const q = query.toLowerCase().trim();
    return this.state.nodes.filter(
      (n) => n.name.toLowerCase() === q || n.id.toLowerCase() === q || n.name.toLowerCase().includes(q)
    );
  }

  public getNodes(): GraphNode[] {
    return this.state.nodes;
  }

  public getEdges(): GraphEdge[] {
    return this.state.edges;
  }

  public getOutboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.state.edges.filter((e) => e.from === nodeId && (!edgeType || e.type === edgeType));
  }

  public getInboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.state.edges.filter((e) => e.to === nodeId && (!edgeType || e.type === edgeType));
  }

  /**
   * Compute the blast-radius node/edge SET reachable from a target within
   * maxDepth (following edges in both directions). This is a linear BFS — each
   * node is visited at most once — so it stays fast even on dense real-world
   * graphs with thousands of edges. It intentionally does NOT enumerate every
   * simple path (which is combinatorially explosive and would block the event
   * loop); human-meaningful per-endpoint paths are derived separately by the
   * StaticImpactEngine.
   */
  public traverseBlastRadius(targetNodeId: string, maxDepth: number = 6): TraversalResult {
    const targetNode = this.getNode(targetNodeId);
    if (!targetNode) {
      throw new Error(`Node with id '${targetNodeId}' not found in HydraDB graph.`);
    }

    // Precompute a bidirectional adjacency index once (O(E)) so per-node lookups
    // are O(1) rather than scanning every edge each time.
    const adjacencyIndex = new Map<string, GraphEdge[]>();
    for (const edge of this.state.edges) {
      (adjacencyIndex.get(edge.from) ?? adjacencyIndex.set(edge.from, []).get(edge.from)!).push(edge);
      if (edge.to !== edge.from) {
        (adjacencyIndex.get(edge.to) ?? adjacencyIndex.set(edge.to, []).get(edge.to)!).push(edge);
      }
    }

    const visitedNodes = new Map<string, GraphNode>();
    const visitedEdges = new Map<string, GraphEdge>();
    visitedNodes.set(targetNode.id, targetNode);

    // BFS using an index pointer (not Array.shift, which is O(n) and would make
    // the whole traversal quadratic on large graphs).
    const frontier: { id: string; depth: number }[] = [{ id: targetNode.id, depth: 0 }];
    const enqueued = new Set<string>([targetNode.id]);
    for (let head = 0; head < frontier.length; head++) {
      const { id, depth } = frontier[head];
      if (depth >= maxDepth) continue;
      for (const edge of adjacencyIndex.get(id) ?? []) {
        visitedEdges.set(edge.id, edge);
        const nextId = edge.from === id ? edge.to : edge.from;
        const nextNode = this.getNode(nextId);
        if (!nextNode) continue;
        if (!visitedNodes.has(nextId)) visitedNodes.set(nextId, nextNode);
        if (!enqueued.has(nextId)) {
          enqueued.add(nextId);
          frontier.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    return {
      targetNode,
      nodes: Array.from(visitedNodes.values()),
      edges: Array.from(visitedEdges.values()),
      paths: [],
    };
  }

  public getExecutionTraces(): GraphNode[] {
    return this.state.nodes.filter((n) => n.type === 'TraceRequest');
  }

  public getExecutionSpansForTrace(traceId: string): GraphNode[] {
    // Walk the full PARENT_OF tree rooted at the trace request, depth-first, so
    // the caller receives every nested ExecutionSpan in execution order with a
    // `depth` hint for rendering the waterfall. Returned nodes are shallow
    // copies so the persisted graph is never mutated.
    const ordered: GraphNode[] = [];
    const visited = new Set<string>([traceId]);

    const walk = (nodeId: string, depth: number) => {
      const childEdges = this.getOutboundEdges(nodeId, 'PARENT_OF');
      // Deterministic ordering: by child span creation time then id.
      const children = childEdges
        .map((e) => this.getNode(e.to))
        .filter((n): n is GraphNode => Boolean(n) && n!.type === 'ExecutionSpan')
        .sort((a, b) => {
          // Prefer explicit execution order when present; otherwise fall back to
          // creation time, then id, so ordering is always deterministic.
          const ao = a.metadata?.order;
          const bo = b.metadata?.order;
          if (typeof ao === 'number' && typeof bo === 'number') return ao - bo;
          return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
        });

      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        ordered.push({ ...child, metadata: { ...(child.metadata || {}), depth } });
        walk(child.id, depth + 1);
      }
    };

    walk(traceId, 0);
    return ordered;
  }

  public getRuntimeSpansForSymbol(symbolNameOrId: string): GraphNode[] {
    const targetNode = this.getNode(symbolNameOrId) || this.findNodesByNameOrSymbol(symbolNameOrId)[0];
    const nameToMatch = targetNode ? targetNode.name : symbolNameOrId;

    return this.state.nodes.filter((n) => {
      if (n.type !== 'ExecutionSpan') return false;
      const fnName = n.metadata?.functionName || n.name;
      return fnName === nameToMatch || fnName === targetNode?.id;
    });
  }

  public async ingestContext(payload: { content: string; metadata?: Record<string, any> }): Promise<{ sourceId: string; status: string }> {
    const sourceId = `local_ctx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.upsertNode({
      id: sourceId,
      type: 'Module',
      name: `Context:${payload.metadata?.symbol || 'Generic'}`,
      metadata: {
        content: payload.content,
        ...(payload.metadata || {}),
      },
    });
    this.saveState();
    return { sourceId, status: 'indexed' };
  }

  public async ingestContextBatch(
    items: { content: string; metadata?: Record<string, any> }[]
  ): Promise<{ ingested: number; mode: 'cloud' | 'local' }> {
    for (const it of items) await this.ingestContext(it);
    return { ingested: items.length, mode: 'local' };
  }

  public async queryContext(query: string, options?: { maxResults?: number; commitSha?: string; symbolType?: string }): Promise<HydraDBContextQueryResult[]> {
    const q = query.toLowerCase();
    const matches = this.state.nodes.filter((n) => {
      if (options?.commitSha && n.commitSha && n.commitSha !== options.commitSha) return false;
      if (options?.symbolType && n.type !== options.symbolType) return false;

      const nameMatch = n.name.toLowerCase().includes(q);
      const metaMatch = JSON.stringify(n.metadata || {}).toLowerCase().includes(q);
      return nameMatch || metaMatch;
    });

    const results: HydraDBContextQueryResult[] = matches.slice(0, options?.maxResults || 5).map((m, idx) => ({
      content: `[Symbol: ${m.name}] Type: ${m.type} in ${m.filePath || 'local'}. Metadata: ${JSON.stringify(m.metadata || {})}`,
      score: 1.0 - idx * 0.1,
      metadata: {
        source_id: m.id,
        filePath: m.filePath,
        commitSha: m.commitSha,
        symbolType: m.type,
        additional_metadata: m.metadata,
      },
    }));

    return results;
  }
}
