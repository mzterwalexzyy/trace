/**
 * TRACE instrumentation hook.
 *
 * This is the single seam the demo app exposes for runtime tracing. In normal
 * standalone operation `traced()` is a transparent pass-through with zero
 * overhead, so the demo app runs and behaves like any ordinary Express service.
 *
 * When TRACE drives the app in-process (see src/server/demo-runner.ts), it
 * installs a real implementation via `setTraceImpl()`. From that point on every
 * `traced(name, fn)` call emits a real ExecutionSpan for the *actual* function
 * execution, nested according to the real call stack. Nothing about the result
 * is fabricated: durations, ordering and nesting all come from real runtime.
 *
 * The implementation preserves the synchronicity of `fn`: a synchronous
 * function stays synchronous (its value is returned directly) and an async
 * function stays async. This keeps existing call sites working unchanged.
 *
 * This mirrors how a real application would adopt TRACE's tracing SDK.
 */

export type TraceImpl = <T>(name: string, fn: () => T) => T;

let impl: TraceImpl | null = null;

/** Install a real tracing implementation (called by the TRACE runtime). */
export function setTraceImpl(next: TraceImpl | null): void {
  impl = next;
}

/** Wrap the execution of `fn` in a named span when tracing is active. */
export function traced<T>(name: string, fn: () => T): T {
  if (!impl) return fn();
  return impl(name, fn);
}
