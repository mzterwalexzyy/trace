# TRACE

Engineering intelligence before you ship. TRACE answers one question about a
code change: **if I change this, what else could be affected, what actually ran
at runtime, and what context should I know?**

It combines three layers:

```
   STATIC GRAPH        +      RUNTIME EVIDENCE      +     HYDRADB CONTEXT
 (deterministic AST)         (observed spans)          (retrieval + KG)
                              =
                     CHANGE IMPACT INTELLIGENCE
```

TRACE is built for the **Hack Hydra** hackathon, Track 02 (Repos, Dependencies
and Code as Graphs — code graphs for IDE assistants). It uses the real
`@hydradb/sdk` for context ingestion and retrieval, and keeps a deterministic
local graph engine for exact structural analysis.

**Live demo:** https://trace-gules-chi.vercel.app — analyze the bundled demo, or
paste a public GitHub repo URL to analyze it in the browser.

---

## Why it exists

An IDE assistant that retrieves code by embedding similarity cannot tell you
that changing `calculateTax` touches `POST /api/checkout`. Relevance for a code
change is a graph problem: call chains, endpoints, database writes and tests.
TRACE builds that graph deterministically, records which paths actually execute
at runtime, and uses HydraDB to layer semantic context on top.

## What it does

Two core questions:

1. **What could be affected if I change this?** TRACE parses the repository into
   a dependency graph (files, functions, classes, API endpoints, DB schemas) and
   computes the blast radius: affected functions, files, endpoints, schemas,
   tests, callers, callees and reachable routes.

2. **What actually happened when this ran?** TRACE records real execution traces
   (a nested span tree per request) and intersects them with the static graph.
   Every reachable route is classified **VERIFIED** (has runtime evidence) or
   **UNOBSERVED** (exists statically, never observed). This distinction is the
   heart of TRACE.

**Ask TRACE** lets you ask these questions in natural language ("what does
changing calculateTax affect?", "which endpoints are unobserved?"). Answers are
grounded in the real graph, runtime evidence and HydraDB context. If no AI key is
configured it answers in Evidence Mode straight from the structured findings, and
it never fabricates symbols that are not in the analyzed repository.

## Architecture

```
                         TRACE
                           |
      +--------------------+--------------------+
      |                    |                    |
   STATIC GRAPH        RUNTIME TRACES       HYDRADB CONTEXT
 (AST, local engine)  (execution spans)   (@hydradb/sdk cloud)
      |                    |                    |
      +--------------------+--------------------+
                           v
                     CHANGE IMPACT
```

- **Static layer** (`src/core/parser`, `src/core/impact`): a two-pass TypeScript
  AST analyzer builds nodes (Repository, File, Module, Class, Function,
  APIEndpoint, DBSchema) and edges (CONTAINS, IMPORTS, CALLS, EXPOSES,
  READS_SCHEMA, WRITES_SCHEMA, TESTED_BY). The impact engine walks the graph to
  compute the blast radius and one shortest caller-path to each affected
  endpoint. All of it is deterministic and sorted for stable output.

- **Runtime layer** (`src/core/runtime`, `src/server/demo-runner.ts`): a tracer
  records a real nested span tree (TraceRequest -> ExecutionSpan). The bundled
  demo app is genuinely instrumented through a `traced()` seam, so spans, their
  nesting and durations all come from real execution.

- **HydraDB layer** (`src/core/hydradb`): a driver abstraction with a local file
  backend and a cloud backend built on `@hydradb/sdk`. See below.

## How TRACE uses HydraDB

TRACE uses HydraDB as its **context and knowledge layer**, through the real
installed SDK (`@hydradb/sdk`, version 2.1.2). Concretely:

- **Ingestion** (`context.ingest`): after analysis, TRACE ingests one context
  document per symbol (function / method / endpoint) into HydraDB, scoped by
  metadata (`symbol`, `filePath`, `commitSha`, `repository`).
- **Retrieval** (`query`): when you inspect a symbol's change impact, TRACE
  queries HydraDB for relevant context and shows the ranked results, with
  optional commit-scoped metadata filtering.
- **Knowledge graph**: HydraDB automatically extracts relationship triplets from
  the ingested context (for example `calculateTax -[used by]-> POST /api/checkout`,
  `calculateTax -[defined in]-> tax.ts`). TRACE surfaces these triplets, so the
  cloud layer contributes graph-native context that complements the local graph.
- **Connection state**: the header shows `Connected` only after a real
  successful HydraDB request has completed, never merely because a key is set.

What TRACE does **not** claim: HydraDB does not run TRACE's deterministic
blast-radius traversal, and TRACE does not issue Cypher against it. The exact
structural analysis is done by TRACE's local engine; HydraDB provides cloud
context ingestion, retrieval and its own knowledge graph. This boundary is
deliberate and matches what the installed SDK actually exposes.

## Local mode vs cloud mode

TRACE is local-first. Without any credentials it runs fully: AST parsing, local
graph persistence (`.trace/hydradb_graph.json`), blast radius, runtime tracing,
intersection analysis and the whole UI. Context ingestion and retrieval fall
back to the local graph.

With `HYDRA_DB_API_KEY` set, the same flows additionally use HydraDB Cloud for
ingestion and retrieval. If the cloud is unavailable, TRACE degrades gracefully
back to local rather than failing.

## Install

Requirements: Node.js 22+ (uses native TypeScript type-stripping and the built-in
test runner).

```bash
npm install
```

## Environment

Copy `.env.example` to `.env` (or export the variables). All are optional; TRACE
runs locally without them.

| Variable | Meaning |
| --- | --- |
| `HYDRA_DB_API_KEY` | HydraDB Cloud API key (from https://dashboard.hydradb.com). When present, TRACE uses cloud mode. |
| `HYDRA_DB_DATABASE` | HydraDB database/tenant name. Defaults to `default`. |
| `TRACE_MODE` | Force `local` or `cloud`. Auto-selects when unset. |
| `PORT` | Server port. Defaults to 3000. |

Credentials are read from the environment only. They are never printed, logged
or committed (`.env*` and `trace_credential*` are gitignored).

## Launch

```bash
npm run build
npm run server
```

Then open http://localhost:3000. The server binds to localhost only.

To run with HydraDB Cloud, set the environment variables first, for example:

```bash
export HYDRA_DB_API_KEY=... HYDRA_DB_DATABASE=hydra
npm run server
```

For UI development with hot reload, run the API server and Vite together:

```bash
npm run server        # API on :3000
npm run dev           # Vite dev server on :5173, proxies /api to :3000
```

## Analyzing a public GitHub repo

Besides the bundled demo and local paths, TRACE can analyze any public GitHub
repository by URL. Paste a URL like `https://github.com/developit/mitt` into the
onboarding modal (or the Repository page). TRACE downloads the repo's source
tarball from the GitHub API, extracts it, and runs the same AST analysis. No git
binary is required, so this works on serverless hosts too. Private repositories
need a connected account and are not analyzed from a bare URL.

## Cloud deployment (Vercel + Supabase)

The live demo runs on Vercel with the API as a serverless function
(`api/index.ts` re-exports the Express app). Two things make a stateless host
work:

- **Filesystem:** serverless filesystems are read-only except `/tmp`, so on
  Vercel TRACE writes its `.trace` data and cloned repos under the OS temp dir.
- **State across invocations:** the in-memory graph does not survive between
  function calls. After each analysis TRACE mirrors the active graph to Supabase
  Storage and rehydrates it on a cold request, so Change Impact, Ask and Runtime
  stay consistent across invocations.

Supabase also backs multi-user persistence (repositories, runs, graphs). It is
optional: with no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` set, TRACE uses
its local `.trace` store and everything still works. See `SUPABASE_SETUP.md` for
the schema and setup. A `Dockerfile` is included for container deployments (it
bundles the git binary, so URL analysis there can use either git or the tarball
path).

Deployment environment variables (all optional):

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Enable Supabase persistence and serverless graph rehydration. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Enable the Ask TRACE AI explanation layer. Without a key, Ask uses Evidence Mode. |

## The demo, in under two minutes

1. Open TRACE and click **Get Started**. TRACE analyzes the bundled demo app.
2. Go to **Architecture Explorer**. You see the system as labelled domains
   (Handlers, Services, Database, Entry, Tracing) plus the HydraDB layer. Drill
   into a domain, then a file, then a symbol. Click a symbol to enter Focus mode
   and see its dependents and dependencies.
3. Go to **Runtime Traces** and click **Run POST /api/checkout**. TRACE records a
   real nested span tree: `checkoutHandler -> calculateTotal -> calculateTax`,
   plus `chargeStripePayment` and `createOrderInDatabase`, with real durations.
4. Go to **Change Impact** and select `calculateTax`. You see two reachable
   routes:
   - `calculateTax -> calculateTotal -> checkoutHandler -> POST /api/checkout` is
     **VERIFIED** (observed in the trace you just ran).
   - `calculateTax -> invoiceHandler -> GET /api/invoice` is **UNOBSERVED**.
5. The HydraDB Context Recall panel shows relevant context retrieved for the
   symbol.

That contrast — what *can* happen versus what *did* happen — is the point.

## CLI

The same engine is available from the command line:

```bash
npm run trace -- analyze demo-app        # build the graph, ingest context
npm run trace -- run <cmd>               # run a command with tracing enabled
npm run trace -- impact calculateTax     # print a change-impact report
npm run trace -- traces                  # list recorded execution traces
npm run trace -- hydra status            # show storage mode / connection
npm run trace -- hydra query "<text>"    # query HydraDB context
```

## How runtime verification works

A path is VERIFIED when at least one function along it appears in the recorded
execution spans; otherwise it is UNOBSERVED. Endpoints are classified by whether
their handler was observed. The UI never implies a static dependency was executed
unless there is a matching runtime span. Runtime tracing of the bundled demo runs
in-process through the demo app's `traced()` seam; to trace your own application,
add TRACE's tracing SDK (`src/core/runtime`) to it.

## Security

- The API server binds to `127.0.0.1` only. TRACE reads local source files by
  design, so it is not exposed to the network.
- `POST /api/runtime/run` never executes arbitrary commands. It runs one of a
  fixed, allow-listed set of demo scenarios in-process. There is no shell
  invocation and no user-supplied command path.
- `POST /api/repository/analyze` resolves and validates the target path and only
  parses source files; combined with localhost binding this keeps file access
  local to the operator. When given a GitHub URL it fetches only that public
  repository's source tarball over HTTPS from the GitHub API before parsing.
- Credentials come from environment variables only and are never printed or
  committed.

## Testing

```bash
npm test
```

Runs the suite through the `tsx` loader (Node's built-in test runner):

- AST parsing, graph creation, symbol search and detail (`repo-api`, `symbols-api`).
- End-to-end: analyze -> trace -> intersect -> impact report, asserting VERIFIED
  checkout and UNOBSERVED invoice (`e2e-acceptance`).
- Live HydraDB cloud round-trip: connect, ingest, query, metadata filter
  (`cloud-integration`). Skipped automatically when `HYDRA_DB_API_KEY` is unset;
  set it to run the real cloud test.

## Determinism

Given the same repository snapshot and runtime evidence, TRACE produces the same
impact report. Traversals use stable identifiers and sorted output. There is no
LLM in the structural analysis or blast-radius path.

## Limitations

- The static analyzer resolves calls by name within the analyzed repository. It
  does not do full type-based resolution, so cross-package or dynamically
  dispatched calls may be missed.
- Runtime tracing ships instrumented for the bundled demo app. Tracing an
  arbitrary repository requires adding the tracing seam to that app.
- HydraDB indexing is asynchronous; freshly ingested context may take a few
  seconds to become queryable, during which TRACE falls back to local context.

## Tech stack

TypeScript, the TypeScript compiler API (AST), Express, React + Vite,
`@hydradb/sdk`, Node's built-in test runner via `tsx`.

## License

MIT. See [LICENSE](LICENSE).
