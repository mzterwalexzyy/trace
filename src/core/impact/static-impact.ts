import { HydraDBClient } from '../hydradb/client.js';
import { GraphNode, GraphEdge, GraphPath, TraversalResult } from '../hydradb/types.js';

export interface StaticImpactAnalysis {
  targetNode: GraphNode;
  affectedNodes: GraphNode[];
  affectedEdges: GraphEdge[];
  paths: GraphPath[];
  endpoints: GraphNode[];
  tests: GraphNode[];
  dbSchemas: GraphNode[];
}

export class StaticImpactEngine {
  private dbClient: HydraDBClient;

  constructor(dbClient: HydraDBClient) {
    this.dbClient = dbClient;
  }

  public analyzeSymbol(symbolNameOrId: string, maxDepth: number = 6): StaticImpactAnalysis {
    let targetNode = this.dbClient.getNode(symbolNameOrId);
    if (!targetNode) {
      const candidates = this.dbClient.findNodesByNameOrSymbol(symbolNameOrId);
      if (candidates.length === 0) {
        throw new Error(`Symbol or Node '${symbolNameOrId}' not found in HydraDB graph.`);
      }
      targetNode = candidates[0];
    }

    // Full blast-radius set (undirected) drives node/schema/service counts and
    // the architecture view.
    const traversal: TraversalResult = this.dbClient.traverseBlastRadius(targetNode.id, maxDepth);

    const endpoints = traversal.nodes
      .filter((n) => n.type === 'APIEndpoint')
      .sort((a, b) => a.name.localeCompare(b.name));
    const tests = traversal.nodes.filter((n) => n.type === 'Function' && n.metadata?.isTest);
    const dbSchemas = traversal.nodes.filter((n) => n.type === 'DBSchema');

    // Reachable paths are computed as exactly one shortest caller-path from the
    // changed symbol up to each affected endpoint. This is deterministic and
    // human-meaningful (one route per endpoint) rather than an exponential
    // enumeration of every simple path through the graph.
    const paths = this.computeImpactPaths(targetNode, endpoints, maxDepth);

    return {
      targetNode,
      affectedNodes: traversal.nodes,
      affectedEdges: traversal.edges,
      paths,
      endpoints,
      tests,
      dbSchemas,
    };
  }

  /**
   * For each endpoint, return the shortest caller chain from the changed symbol
   * up to that endpoint, following inbound caller edges (CALLS / EXPOSES). The
   * resulting path reads target → caller → … → endpoint.
   */
  private computeImpactPaths(target: GraphNode, endpoints: GraphNode[], maxDepth: number): GraphPath[] {
    const endpointIds = new Set(endpoints.map((e) => e.id));
    const callerEdgeTypes = new Set(['CALLS', 'EXPOSES']);

    // BFS over inbound caller edges, recording the first (shortest) path to each
    // endpoint. `parent` maps nodeId -> { edge, fromId } used to reach it.
    const parent = new Map<string, { edge: GraphEdge; fromId: string }>();
    const visited = new Set<string>([target.id]);
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: target.id, depth: 0 }];
    const foundEndpointPaths: GraphPath[] = [];
    const seenEndpoints = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const inbound = this.dbClient
        .getInboundEdges(nodeId)
        .filter((e) => callerEdgeTypes.has(e.type))
        .sort((a, b) => a.from.localeCompare(b.from));

      for (const edge of inbound) {
        const callerId = edge.from;
        if (visited.has(callerId)) continue;
        visited.add(callerId);
        parent.set(callerId, { edge, fromId: nodeId });

        if (endpointIds.has(callerId) && !seenEndpoints.has(callerId)) {
          seenEndpoints.add(callerId);
          foundEndpointPaths.push(this.reconstructPath(target, callerId, parent));
        }
        queue.push({ nodeId: callerId, depth: depth + 1 });
      }
    }

    // Stable ordering by endpoint name for deterministic output.
    foundEndpointPaths.sort((a, b) => {
      const an = a.nodes[a.nodes.length - 1]?.name || '';
      const bn = b.nodes[b.nodes.length - 1]?.name || '';
      return an.localeCompare(bn);
    });

    return foundEndpointPaths;
  }

  private reconstructPath(
    target: GraphNode,
    endpointId: string,
    parent: Map<string, { edge: GraphEdge; fromId: string }>
  ): GraphPath {
    // Walk from endpoint back to target, then reverse so the path reads
    // target → … → endpoint.
    const nodesReversed: GraphNode[] = [];
    const edgesReversed: GraphEdge[] = [];
    let currentId: string | undefined = endpointId;

    while (currentId && currentId !== target.id) {
      const node = this.dbClient.getNode(currentId);
      if (node) nodesReversed.push(node);
      const link = parent.get(currentId);
      if (!link) break;
      edgesReversed.push(link.edge);
      currentId = link.fromId;
    }
    nodesReversed.push(target);

    return {
      nodes: nodesReversed.reverse(),
      edges: edgesReversed.reverse(),
    };
  }
}
