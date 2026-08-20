import { HydraDBClient as OfficialHydraSDK } from '@hydradb/sdk';
import { LocalHydraDB } from '../local/LocalHydraDB.js';
import {
  GraphNode,
  GraphEdge,
  EdgeType,
  TraversalResult,
} from '../types.js';
import {
  IHydraDBDriver,
  StorageModeInfo,
  HydraDBContextQueryResult,
} from '../interface.js';

export class HydraDBCloud implements IHydraDBDriver {
  private localGraph: LocalHydraDB;
  private sdkClient: any;
  private apiKey: string;
  private databaseName: string;
  private connectionStatus: 'Connected' | 'Configured' | 'Offline' = 'Offline';
  private lastVerifiedAt?: string;

  constructor(options?: { apiKey?: string; database?: string; dbPath?: string }) {
    this.apiKey = options?.apiKey || process.env.HYDRA_DB_API_KEY || '';
    this.databaseName = options?.database || process.env.HYDRA_DB_DATABASE || 'default';
    this.localGraph = new LocalHydraDB({ dbPath: options?.dbPath });

    if (this.apiKey) {
      try {
        this.sdkClient = new OfficialHydraSDK({
          token: this.apiKey,
        });
        this.connectionStatus = 'Configured';
      } catch (err: any) {
        this.connectionStatus = 'Offline';
        console.warn(`[HydraDB Cloud Init Warning] Failed to initialize @hydradb/sdk: ${err.message}`);
      }
    } else {
      this.connectionStatus = 'Offline';
    }
  }

  public async pingConnection(): Promise<boolean> {
    if (!this.sdkClient || !this.apiKey) {
      this.connectionStatus = 'Offline';
      return false;
    }
    try {
      await this.sdkClient.databases.list();
      this.connectionStatus = 'Connected';
      this.lastVerifiedAt = new Date().toISOString();
      return true;
    } catch {
      this.connectionStatus = 'Offline';
      return false;
    }
  }

  public getStorageModeInfo(): StorageModeInfo {
    const isCloud = Boolean(this.apiKey);
    return {
      mode: isCloud ? 'HydraDB Cloud' : 'Local',
      status: isCloud ? this.connectionStatus : 'Offline',
      isConnected: this.connectionStatus === 'Connected',
      database: this.databaseName,
      sdkPackage: '@hydradb/sdk@2.1.2',
      lastVerifiedAt: this.lastVerifiedAt,
    };
  }

  public setSnapshotMetadata(commitSha: string, snapshotId: string): void {
    this.localGraph.setSnapshotMetadata(commitSha, snapshotId);
  }

  public getSnapshotId(): string {
    return this.localGraph.getSnapshotId();
  }

  public upsertNode(nodeInput: Omit<GraphNode, 'createdAt'> & { createdAt?: string }): GraphNode {
    return this.localGraph.upsertNode(nodeInput);
  }

  public addEdge(edgeInput: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): GraphEdge {
    return this.localGraph.addEdge(edgeInput);
  }

  public getNode(id: string): GraphNode | undefined {
    return this.localGraph.getNode(id);
  }

  public getNodes(): GraphNode[] {
    return this.localGraph.getNodes();
  }

  public getEdges(): GraphEdge[] {
    return this.localGraph.getEdges();
  }

  public findNodes(predicate: (node: GraphNode) => boolean): GraphNode[] {
    return this.localGraph.findNodes(predicate);
  }

  public findNodesByNameOrSymbol(query: string): GraphNode[] {
    return this.localGraph.findNodesByNameOrSymbol(query);
  }

  public getOutboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.localGraph.getOutboundEdges(nodeId, edgeType);
  }

  public getInboundEdges(nodeId: string, edgeType?: EdgeType): GraphEdge[] {
    return this.localGraph.getInboundEdges(nodeId, edgeType);
  }

  public traverseBlastRadius(targetNodeId: string, maxDepth: number = 6): TraversalResult {
    return this.localGraph.traverseBlastRadius(targetNodeId, maxDepth);
  }

  public getExecutionTraces(): GraphNode[] {
    return this.localGraph.getExecutionTraces();
  }

  public getExecutionSpansForTrace(traceId: string): GraphNode[] {
    return this.localGraph.getExecutionSpansForTrace(traceId);
  }

  public getRuntimeSpansForSymbol(symbolNameOrId: string): GraphNode[] {
    return this.localGraph.getRuntimeSpansForSymbol(symbolNameOrId);
  }

  public saveState(): void {
    this.localGraph.saveState();
  }

  public clear(): void {
    this.localGraph.clear();
  }

  /**
   * Real Cloud Context Ingestion using @hydradb/sdk v2
   */
  public async ingestContext(payload: { content: string; metadata?: Record<string, any> }): Promise<{ sourceId: string; status: string }> {
    if (!this.sdkClient || !this.apiKey) {
      this.connectionStatus = 'Offline';
      return this.localGraph.ingestContext(payload);
    }

    try {
      const res = await this.sdkClient.context.ingest({
        database: this.databaseName,
        appKnowledge: JSON.stringify([
          {
            title: payload.metadata?.symbol || 'TRACE Context',
            content: { text: payload.content },
            metadata: payload.metadata || {},
          },
        ]),
      });

      this.connectionStatus = 'Connected';
      this.lastVerifiedAt = new Date().toISOString();

      const responseData = res?.data || res;
      const firstResult = responseData?.results?.[0];
      const sourceId = firstResult?.id || responseData?.source_id || `hydra_${Date.now()}`;
      const status = firstResult?.status || responseData?.status || 'queued';

      // Track in local graph index as well
      this.localGraph.upsertNode({
        id: sourceId,
        type: 'Module',
        name: `Context:${payload.metadata?.symbol || 'Generic'}`,
        metadata: payload.metadata,
      });
      this.localGraph.saveState();

      return { sourceId, status };
    } catch (err: any) {
      this.connectionStatus = 'Offline';
      console.warn(`[HydraDB Cloud Ingest Warning]: ${err.message}. Falling back to local index.`);
      return this.localGraph.ingestContext(payload);
    }
  }

  /**
   * Ingest many code-symbol context documents in a single HydraDB request.
   * Each item becomes one searchable knowledge document scoped by its metadata
   * (symbol, filePath, commitSha), so later `queryContext` calls can retrieve
   * relevant per-symbol context rather than a single repository summary.
   */
  public async ingestContextBatch(
    items: { content: string; metadata?: Record<string, any> }[]
  ): Promise<{ ingested: number; mode: 'cloud' | 'local' }> {
    if (items.length === 0) return { ingested: 0, mode: this.apiKey ? 'cloud' : 'local' };

    if (!this.sdkClient || !this.apiKey) {
      for (const it of items) await this.localGraph.ingestContext(it);
      return { ingested: items.length, mode: 'local' };
    }

    try {
      const appKnowledge = items.map((it) => ({
        title: it.metadata?.symbol ? `${it.metadata.symbol}` : 'TRACE Context',
        content: { text: it.content },
        metadata: it.metadata || {},
      }));
      await this.sdkClient.context.ingest({
        database: this.databaseName,
        appKnowledge: JSON.stringify(appKnowledge),
      });
      this.connectionStatus = 'Connected';
      this.lastVerifiedAt = new Date().toISOString();
      return { ingested: items.length, mode: 'cloud' };
    } catch (err: any) {
      console.warn(`[HydraDB Cloud Batch Ingest Warning]: ${err.message}. Falling back to local index.`);
      for (const it of items) await this.localGraph.ingestContext(it);
      return { ingested: items.length, mode: 'local' };
    }
  }

  /**
   * Real Cloud Context Query using @hydradb/sdk
   */
  public async queryContext(query: string, options?: { maxResults?: number; commitSha?: string; symbolType?: string }): Promise<HydraDBContextQueryResult[]> {
    if (!this.sdkClient || !this.apiKey) {
      this.connectionStatus = 'Offline';
      return this.localGraph.queryContext(query, options);
    }

    try {
      const res = await this.sdkClient.query({
        database: this.databaseName,
        query,
        maxResults: options?.maxResults || 5,
        // SDK expects camelCase `metadataFilters`; only send when scoping by commit.
        metadataFilters: options?.commitSha ? { commitSha: options.commitSha } : undefined,
      });

      this.connectionStatus = 'Connected';
      this.lastVerifiedAt = new Date().toISOString();

      const responseData = res?.data || res;
      const chunks = responseData?.chunks || [];
      const chunkRelations = responseData?.graphContext?.chunkRelations || [];

      const results: HydraDBContextQueryResult[] = [];

      for (const chunk of chunks) {
        let contentText = chunk.sourceTitle || 'Hydra Cloud Context';
        if (chunk.chunkContent) {
          try {
            const parsed = JSON.parse(chunk.chunkContent);
            contentText = parsed?.content?.text || chunk.chunkContent;
          } catch {
            contentText = chunk.chunkContent;
          }
        }
        results.push({
          content: contentText,
          score: chunk.relevancyScore || 1.0,
          metadata: {
            symbolType: 'ContextChunk',
            additional_metadata: chunk.metadata,
          },
        });
      }

      for (const rel of chunkRelations) {
        for (const t of rel.triplets || []) {
          results.push({
            content: `Graph Triplet: ${t.source?.name} -[${t.relation?.canonical_predicate}]-> ${t.target?.name} (${t.relation?.context || ''})`,
            score: rel.relevancyScore || 0.9,
            metadata: {
              symbolType: 'KnowledgeGraphTriplet',
            },
          });
        }
      }

      if (results.length === 0) {
        return this.localGraph.queryContext(query, options);
      }

      return results;
    } catch (err: any) {
      this.connectionStatus = 'Offline';
      console.warn(`[HydraDB Cloud Query Warning]: ${err.message}. Falling back to local index.`);
      return this.localGraph.queryContext(query, options);
    }
  }

  /**
   * Helper to check ingestion status on HydraDB Cloud
   */
  public async checkStatus(sourceId: string): Promise<any> {
    if (!this.sdkClient || !this.apiKey) return null;
    try {
      const res = await this.sdkClient.context.status({
        database: this.databaseName,
        id: sourceId,
      });
      return res?.data || res;
    } catch {
      return null;
    }
  }
}
