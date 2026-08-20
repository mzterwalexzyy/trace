import { GraphNode, GraphEdge, EdgeType, TraversalResult } from './types.js';

export interface StorageModeInfo {
  mode: 'Local' | 'HydraDB Cloud';
  status: 'Connected' | 'Configured' | 'Offline';
  isConnected: boolean;
  database: string;
  sdkPackage: string;
  lastVerifiedAt?: string;
}

export interface HydraDBContextQueryResult {
  content: string;
  score: number;
  metadata?: {
    source_id?: string;
    filePath?: string;
    commitSha?: string;
    symbolType?: string;
    additional_metadata?: Record<string, any>;
  };
}

export interface IHydraDBDriver {
  getStorageModeInfo(): StorageModeInfo;
  setSnapshotMetadata(commitSha: string, snapshotId: string): void;
  getSnapshotId(): string;
  upsertNode(nodeInput: Omit<GraphNode, 'createdAt'> & { createdAt?: string }): GraphNode;
  addEdge(edgeInput: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): GraphEdge;
  getNode(id: string): GraphNode | undefined;
  getNodes(): GraphNode[];
  getEdges(): GraphEdge[];
  findNodes(predicate: (node: GraphNode) => boolean): GraphNode[];
  findNodesByNameOrSymbol(query: string): GraphNode[];
  getOutboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[];
  getInboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[];
  traverseBlastRadius(targetNodeId: string, maxDepth?: number): TraversalResult;
  getExecutionTraces(): GraphNode[];
  getExecutionSpansForTrace(traceId: string): GraphNode[];
  getRuntimeSpansForSymbol(symbolNameOrId: string): GraphNode[];
  saveState(): void;
  clear(): void;
  ingestContext?(payload: { content: string; metadata?: Record<string, any> }): Promise<{ sourceId: string; status: string }>;
  ingestContextBatch?(items: { content: string; metadata?: Record<string, any> }[]): Promise<{ ingested: number; mode: 'cloud' | 'local' }>;
  queryContext?(query: string, options?: { maxResults?: number; commitSha?: string; symbolType?: string }): Promise<HydraDBContextQueryResult[]>;
  pingConnection?(): Promise<boolean>;
}
