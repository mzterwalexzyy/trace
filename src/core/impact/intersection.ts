import { HydraDBClient } from '../hydradb/client.js';
import { StaticImpactAnalysis, StaticImpactEngine } from './static-impact.js';
import { ClassificationPath, GraphNode, GraphPath } from '../hydradb/types.js';
import { StorageModeInfo, HydraDBContextQueryResult } from '../hydradb/interface.js';

export interface EndpointImpactSummary {
  endpointNode: GraphNode;
  status: 'VERIFIED' | 'UNOBSERVED';
  traceCount: number;
}

export interface ChangeImpactReport {
  targetSymbol: GraphNode;
  storageMode: StorageModeInfo;
  totalAffectedNodes: number;
  totalPaths: number;
  verifiedPathCount: number;
  unobservedPathCount: number;
  classifiedPaths: ClassificationPath[];
  endpoints: EndpointImpactSummary[];
  tests: { node: GraphNode; hasExecuted: boolean }[];
  dbSchemas: GraphNode[];
  externalServices: string[];
  hydraContext: HydraDBContextQueryResult[];
  riskSummary: {
    affectedEndpointsCount: number;
    unobservedPathsCount: number;
    testCoverageCount: number;
  };
}

export class IntersectionEngine {
  private dbClient: HydraDBClient;
  private staticImpactEngine: StaticImpactEngine;

  constructor(dbClient: HydraDBClient) {
    this.dbClient = dbClient;
    this.staticImpactEngine = new StaticImpactEngine(dbClient);
  }

  public async generateReportAsync(symbolNameOrId: string, maxDepth: number = 6): Promise<ChangeImpactReport> {
    const report = this.generateReport(symbolNameOrId, maxDepth);
    try {
      const hydraResults = await this.dbClient.queryContext(report.targetSymbol.name, {
        maxResults: 3,
        commitSha: report.targetSymbol.commitSha,
      });
      report.hydraContext = hydraResults;
    } catch {
      report.hydraContext = [];
    }
    return report;
  }

  public generateReport(symbolNameOrId: string, maxDepth: number = 6): ChangeImpactReport {
    const staticImpact: StaticImpactAnalysis = this.staticImpactEngine.analyzeSymbol(symbolNameOrId, maxDepth);
    const recordedSpans = this.dbClient.findNodes((n) => n.type === 'ExecutionSpan');
    const recordedSpanNames = new Set(recordedSpans.map((s) => s.metadata?.functionName || s.name));

    const classifiedPaths: ClassificationPath[] = [];
    let verifiedPathCount = 0;
    let unobservedPathCount = 0;

    for (const path of staticImpact.paths) {
      const targetEndpoint = path.nodes.find((n) => n.type === 'APIEndpoint');
      const pathFunctions = path.nodes.filter(
        (n) => (n.type === 'Function' || n.type === 'Method') && n.id !== staticImpact.targetNode.id && n.name !== staticImpact.targetNode.name
      );
      let matchingSpans = 0;

      for (const fn of pathFunctions) {
        if (recordedSpanNames.has(fn.name) || recordedSpanNames.has(fn.id)) {
          matchingSpans++;
        }
      }

      const isVerified = pathFunctions.length > 0 ? matchingSpans > 0 : false;
      const status = isVerified ? 'VERIFIED' : 'UNOBSERVED';

      if (isVerified) {
        verifiedPathCount++;
      } else {
        unobservedPathCount++;
      }

      const pathTests = path.nodes.filter((n) => n.type === 'Function' && n.metadata?.isTest);

      classifiedPaths.push({
        path,
        targetEndpoint,
        status,
        runtimeSpanCount: matchingSpans,
        testCoverage: pathTests,
      });
    }

    const endpointsSummary: EndpointImpactSummary[] = staticImpact.endpoints.map((epNode) => {
      const handlerEdges = this.dbClient.getOutboundEdges(epNode.id, 'EXPOSES');
      const handlerNodeIds = handlerEdges.map((e) => e.to);
      const handlerNodes = handlerNodeIds.map((id) => this.dbClient.getNode(id)).filter(Boolean) as GraphNode[];

      const isVerified = handlerNodes.some((h) => recordedSpanNames.has(h.name) || recordedSpanNames.has(h.id));
      const traceCount = handlerNodes.reduce((acc, h) => {
        return acc + recordedSpans.filter((s) => (s.metadata?.functionName || s.name) === h.name).length;
      }, 0);

      return {
        endpointNode: epNode,
        status: isVerified ? 'VERIFIED' : 'UNOBSERVED',
        traceCount,
      };
    });

    const tests = staticImpact.tests.map((tNode) => ({
      node: tNode,
      hasExecuted: recordedSpanNames.has(tNode.name),
    }));

    const externalServicesSet = new Set<string>();
    for (const node of staticImpact.affectedNodes) {
      const text = `${node.name} ${JSON.stringify(node.metadata || {})}`.toLowerCase();
      if (text.includes('stripe')) externalServicesSet.add('Stripe');
      if (text.includes('postgres') || text.includes('db')) externalServicesSet.add('PostgreSQL');
      if (text.includes('redis')) externalServicesSet.add('Redis');
      if (text.includes('aws') || text.includes('s3')) externalServicesSet.add('AWS');
      if (text.includes('twilio')) externalServicesSet.add('Twilio');
    }

    return {
      targetSymbol: staticImpact.targetNode,
      storageMode: this.dbClient.getStorageModeInfo(),
      totalAffectedNodes: staticImpact.affectedNodes.length,
      totalPaths: staticImpact.paths.length,
      verifiedPathCount,
      unobservedPathCount,
      classifiedPaths,
      endpoints: endpointsSummary,
      tests,
      dbSchemas: staticImpact.dbSchemas,
      externalServices: Array.from(externalServicesSet),
      hydraContext: [],
      riskSummary: {
        affectedEndpointsCount: endpointsSummary.length,
        unobservedPathsCount: unobservedPathCount,
        testCoverageCount: tests.filter((t) => t.hasExecuted).length,
      },
    };
  }
}
