import { IHydraDBDriver, StorageModeInfo, HydraDBContextQueryResult } from './interface.js';
import { createHydraDBDriver, DriverOptions } from './factory.js';
import {
  GraphNode,
  GraphEdge,
  EdgeType,
  TraversalResult,
} from './types.js';

export class HydraDBClient implements IHydraDBDriver {
  private driver: IHydraDBDriver;

  constructor(options?: DriverOptions) {
    this.driver = createHydraDBDriver(options);
  }

  public getStorageModeInfo(): StorageModeInfo {
    return this.driver.getStorageModeInfo();
  }

  public setSnapshotMetadata(commitSha: string, snapshotId: string): void {
    this.driver.setSnapshotMetadata(commitSha, snapshotId);
  }

  public getSnapshotId(): string {
    return this.driver.getSnapshotId();
  }

  public upsertNode(nodeInput: Omit<GraphNode, 'createdAt'> & { createdAt?: string }): GraphNode {
    return this.driver.upsertNode(nodeInput);
  }

  public addEdge(edgeInput: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): GraphEdge {
    return this.driver.addEdge(edgeInput);
  }

  public getNode(id: string): GraphNode | undefined {
    return this.driver.getNode(id);
  }

  public getNodes(): GraphNode[] {
    return this.driver.getNodes();
  }

  public getEdges(): GraphEdge[] {
    return this.driver.getEdges();
  }

  public findNodes(predicate: (node: GraphNode) => boolean): GraphNode[] {
    return this.driver.findNodes(predicate);
  }

  public findNodesByNameOrSymbol(query: string): GraphNode[] {
    return this.driver.findNodesByNameOrSymbol(query);
  }

  public getOutboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.driver.getOutboundEdges(nodeId, edgeType);
  }

  public getInboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.driver.getInboundEdges(nodeId, edgeType);
  }

  public traverseBlastRadius(targetNodeId: string, maxDepth?: number): TraversalResult {
    return this.driver.traverseBlastRadius(targetNodeId, maxDepth);
  }

  public getExecutionTraces(): GraphNode[] {
    return this.driver.getExecutionTraces();
  }

  public getExecutionSpansForTrace(traceId: string): GraphNode[] {
    return this.driver.getExecutionSpansForTrace(traceId);
  }

  public getRuntimeSpansForSymbol(symbolNameOrId: string): GraphNode[] {
    return this.driver.getRuntimeSpansForSymbol(symbolNameOrId);
  }

  public saveState(): void {
    this.driver.saveState();
  }

  public clear(): void {
    this.driver.clear();
  }

  public async pingConnection(): Promise<boolean> {
    if (this.driver.pingConnection) {
      return this.driver.pingConnection();
    }
    return false;
  }

  public async ingestContext(payload: { content: string; metadata?: Record<string, any> }): Promise<{ sourceId: string; status: string }> {
    if (this.driver.ingestContext) {
      return this.driver.ingestContext(payload);
    }
    return { sourceId: `ctx_${Date.now()}`, status: 'indexed' };
  }

  public async ingestContextBatch(
    items: { content: string; metadata?: Record<string, any> }[]
  ): Promise<{ ingested: number; mode: 'cloud' | 'local' }> {
    if (this.driver.ingestContextBatch) {
      return this.driver.ingestContextBatch(items);
    }
    for (const it of items) {
      if (this.driver.ingestContext) await this.driver.ingestContext(it);
    }
    return { ingested: items.length, mode: 'local' };
  }

  public async queryContext(query: string, options?: { maxResults?: number; commitSha?: string; symbolType?: string }): Promise<HydraDBContextQueryResult[]> {
    if (this.driver.queryContext) {
      return this.driver.queryContext(query, options);
    }
    return [];
  }
}
