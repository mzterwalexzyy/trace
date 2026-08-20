import { AsyncLocalStorage } from 'async_hooks';
import { HydraDBClient } from '../hydradb/client.js';
import { GraphNode } from '../hydradb/types.js';

export interface TraceContext {
  traceId: string;
  currentSpanId: string;
  httpRoute?: string;
  httpMethod?: string;
}

export interface SpanOptions {
  functionName: string;
  filePath?: string;
  metadata?: Record<string, any>;
}

export class RuntimeTracer {
  private static instance: RuntimeTracer;
  private asyncLocalStorage: AsyncLocalStorage<TraceContext>;
  private dbClient: HydraDBClient;

  private constructor(dbClient?: HydraDBClient) {
    this.asyncLocalStorage = new AsyncLocalStorage<TraceContext>();
    this.dbClient = dbClient || new HydraDBClient();
  }

  public static getInstance(dbClient?: HydraDBClient): RuntimeTracer {
    if (!RuntimeTracer.instance) {
      RuntimeTracer.instance = new RuntimeTracer(dbClient);
    } else if (dbClient) {
      RuntimeTracer.instance.dbClient = dbClient;
    }
    return RuntimeTracer.instance;
  }

  public getContext(): TraceContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Start a new top-level Request Trace
   */
  public startTrace<T>(
    name: string,
    metadata: { route?: string; method?: string } = {},
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rootSpanId = `span_${traceId}_root`;
    const timestamp = new Date().toISOString();

    // Store TraceRequest Node in HydraDB
    this.dbClient.upsertNode({
      id: traceId,
      type: 'TraceRequest',
      name: `${metadata.method || 'REQ'} ${metadata.route || name}`,
      metadata: {
        route: metadata.route || name,
        method: metadata.method || 'GET',
        status: 'COMPLETED',
        startTime: timestamp,
      },
    });

    const context: TraceContext = {
      traceId,
      currentSpanId: rootSpanId,
      httpRoute: metadata.route,
      httpMethod: metadata.method,
    };

    return this.asyncLocalStorage.run(context, async () => {
      const startTime = performance.now();
      try {
        const result = await fn();
        const duration = Math.round(performance.now() - startTime);

        this.dbClient.upsertNode({
          id: rootSpanId,
          type: 'ExecutionSpan',
          name: name,
          metadata: {
            duration,
            functionName: name,
            success: true,
          },
        });

        this.dbClient.addEdge({
          from: traceId,
          to: rootSpanId,
          type: 'PARENT_OF',
        });

        this.dbClient.saveState();
        return result;
      } catch (err: any) {
        const duration = Math.round(performance.now() - startTime);
        this.dbClient.upsertNode({
          id: rootSpanId,
          type: 'ExecutionSpan',
          name: name,
          metadata: {
            duration,
            functionName: name,
            success: false,
            error: err.message,
          },
        });
        this.dbClient.saveState();
        throw err;
      }
    });
  }

  /**
   * Record a Function Execution Span inside active trace context
   */
  public traceFunction<T>(
    options: SpanOptions,
    fn: (...args: any[]) => T | Promise<T>
  ): (...args: any[]) => Promise<T> {
    return async (...args: any[]): Promise<T> => {
      const ctx = this.getContext();
      if (!ctx) {
        // Fallback execution if not inside active trace context
        return fn(...args);
      }

      const spanId = `span_${ctx.traceId}_${options.functionName}_${Date.now()}`;
      const parentSpanId = ctx.currentSpanId;
      const startTime = performance.now();

      // Create ExecutionSpan Node
      const newCtx: TraceContext = {
        ...ctx,
        currentSpanId: spanId,
      };

      return this.asyncLocalStorage.run(newCtx, async () => {
        try {
          const result = await fn(...args);
          const duration = Math.round(performance.now() - startTime);

          const spanNode: GraphNode = {
            id: spanId,
            type: 'ExecutionSpan',
            name: options.functionName,
            filePath: options.filePath,
            metadata: {
              duration,
              functionName: options.functionName,
              argCount: args.length,
              success: true,
              ...(options.metadata || {}),
            },
          };

          this.dbClient.upsertNode(spanNode);

          // Link Parent Span -> Child Span
          this.dbClient.addEdge({
            from: parentSpanId,
            to: spanId,
            type: 'PARENT_OF',
          });

          // Link ExecutionSpan -> Static Function Node if found
          const staticNode = this.dbClient.findNodesByNameOrSymbol(options.functionName)[0];
          if (staticNode) {
            this.dbClient.addEdge({
              from: spanId,
              to: staticNode.id,
              type: 'EXECUTED_FUNCTION',
            });
          }

          this.dbClient.saveState();
          return result;
        } catch (err: any) {
          const duration = Math.round(performance.now() - startTime);
          this.dbClient.upsertNode({
            id: spanId,
            type: 'ExecutionSpan',
            name: options.functionName,
            metadata: {
              duration,
              functionName: options.functionName,
              success: false,
              error: err.message,
            },
          });
          this.dbClient.saveState();
          throw err;
        }
      });
    };
  }
}
