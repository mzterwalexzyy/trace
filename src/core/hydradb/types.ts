export type NodeType =
  | 'Repository'
  | 'File'
  | 'Module'
  | 'Class'
  | 'Function'
  | 'Method'
  | 'APIEndpoint'
  | 'DBSchema'
  | 'TraceRequest'
  | 'ExecutionSpan';

export type EdgeType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'CALLS'
  | 'EXPOSES'
  | 'READS_SCHEMA'
  | 'WRITES_SCHEMA'
  | 'TESTED_BY'
  | 'INVOKED_DURING'
  | 'PARENT_OF'
  | 'EXECUTED_FUNCTION'
  | 'TRIGGERED_DB_OPERATION'
  | 'TRIGGERED_EXTERNAL_CALL';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  commitSha?: string;
  snapshotId?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface HydraGraphState {
  version: string;
  commitSha: string;
  snapshotId: string;
  updatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TraversalResult {
  targetNode: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: GraphPath[];
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ClassificationPath {
  path: GraphPath;
  targetEndpoint?: GraphNode;
  status: 'VERIFIED' | 'UNOBSERVED';
  runtimeSpanCount: number;
  testCoverage: GraphNode[];
}
