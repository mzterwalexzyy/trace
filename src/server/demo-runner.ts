import * as path from 'path';
import { pathToFileURL } from 'url';
import { HydraDBClient } from '../core/hydradb/client.js';

/**
 * In-process runtime trace collection for the bundled demo application.
 *
 * This deliberately does NOT shell out or execute arbitrary commands. It imports
 * the demo app's real handler functions and executes them in-process, recording
 * a real ExecutionSpan tree from the actual call stack via the demo app's
 * `traced()` seam (demo-app/src/trace/hook.ts).
 *
 * Everything recorded here is genuine runtime evidence: real durations, real
 * ordering, real nesting. Nothing is hard-coded for the UI.
 */

export type DemoScenario = 'checkout' | 'invoice';

export const DEMO_SCENARIOS: DemoScenario[] = ['checkout', 'invoice'];

interface SpanStackFrame {
  spanId: string;
}

/**
 * Build a synchronous-preserving trace implementation bound to `dbClient` and a
 * given root span. Synchronous functions stay synchronous; async functions stay
 * async. Parent/child nesting follows the real execution stack.
 */
function makeTraceImpl(dbClient: HydraDBClient, traceId: string, rootSpanId: string) {
  const stack: SpanStackFrame[] = [{ spanId: rootSpanId }];
  let seq = 0;

  const impl = <T>(name: string, fn: () => T): T => {
    const order = seq++;
    const spanId = `span_${traceId}_${name}_${order}`;
    const parentSpanId = stack[stack.length - 1].spanId;
    const start = performance.now();
    stack.push({ spanId });

    const finish = (success: boolean, error?: string) => {
      // Pop only our own frame (guards against reentrancy anomalies).
      const idx = stack.findIndex((f) => f.spanId === spanId);
      if (idx >= 0) stack.splice(idx, 1);

      const duration = Math.round((performance.now() - start) * 100) / 100;
      dbClient.upsertNode({
        id: spanId,
        type: 'ExecutionSpan',
        name,
        metadata: { duration, functionName: name, success, order, ...(error ? { error } : {}) },
      });
      dbClient.addEdge({ from: parentSpanId, to: spanId, type: 'PARENT_OF' });

      // Link the runtime span back to its static symbol node when one exists.
      const staticNode = dbClient
        .findNodes((n) => (n.type === 'Function' || n.type === 'Method') && n.name === name)[0];
      if (staticNode) {
        dbClient.addEdge({ from: spanId, to: staticNode.id, type: 'EXECUTED_FUNCTION' });
      }
    };

    let result: T;
    try {
      result = fn();
    } catch (err: any) {
      finish(false, err?.message || String(err));
      throw err;
    }

    if (result && typeof (result as any).then === 'function') {
      return (result as any).then(
        (v: any) => {
          finish(true);
          return v;
        },
        (err: any) => {
          finish(false, err?.message || String(err));
          throw err;
        }
      ) as T;
    }

    finish(true);
    return result;
  };

  return impl;
}

export interface DemoRunResult {
  scenario: DemoScenario;
  route: string;
  method: string;
  traceId: string;
  spanCount: number;
}

/**
 * Execute one demo scenario in-process and persist the resulting trace tree.
 * `repoPath` must point at the bundled demo-app; scenarios are only meaningful
 * there. Returns metadata about the recorded trace.
 */
export async function runDemoScenario(
  dbClient: HydraDBClient,
  repoPath: string,
  scenario: DemoScenario
): Promise<DemoRunResult> {
  const hookUrl = pathToFileURL(path.join(repoPath, 'src', 'trace', 'hook.ts')).href;
  const { setTraceImpl } = await import(hookUrl);

  const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const rootSpanId = `span_${traceId}_root`;
  const route = scenario === 'checkout' ? '/api/checkout' : '/api/invoice';
  const method = scenario === 'checkout' ? 'POST' : 'GET';
  const startedAt = new Date().toISOString();

  dbClient.upsertNode({
    id: traceId,
    type: 'TraceRequest',
    name: `${method} ${route}`,
    metadata: { route, method, status: 'COMPLETED', startTime: startedAt },
  });

  const impl = makeTraceImpl(dbClient, traceId, rootSpanId);
  setTraceImpl(impl);

  const rootStart = performance.now();
  try {
    if (scenario === 'checkout') {
      const url = pathToFileURL(path.join(repoPath, 'src', 'handlers', 'checkout.ts')).href;
      const { checkoutHandler } = await import(url);
      await checkoutHandler(100, 'usr_123', 'tok_visa');
    } else {
      const url = pathToFileURL(path.join(repoPath, 'src', 'handlers', 'invoice.ts')).href;
      const { invoiceHandler } = await import(url);
      invoiceHandler(250, 'Acme Corp');
    }
  } finally {
    setTraceImpl(null);
  }

  const rootDuration = Math.round((performance.now() - rootStart) * 100) / 100;
  dbClient.upsertNode({
    id: rootSpanId,
    type: 'ExecutionSpan',
    name: `${method} ${route}`,
    metadata: { duration: rootDuration, functionName: `${method} ${route}`, success: true, isRoot: true },
  });
  dbClient.addEdge({ from: traceId, to: rootSpanId, type: 'PARENT_OF' });
  dbClient.saveState();

  const spans = dbClient.getExecutionSpansForTrace(traceId);
  return { scenario, route, method, traceId, spanCount: spans.length };
}
