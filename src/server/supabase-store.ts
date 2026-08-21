import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase data layer for TRACE.
 *
 * Uses the SERVICE-ROLE key (bypasses RLS) and always sets `owner` explicitly,
 * so the worker can persist on behalf of the authenticated user. The whole
 * thing is config-gated: with no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set,
 * `isConfigured()` is false and TRACE falls back to its local `.trace` store —
 * nothing breaks and the app runs exactly as before.
 *
 * Auth (resolving `owner` from a user's JWT) is wired in the auth increment;
 * every write here already takes an explicit `owner` so it plugs straight in.
 */

export interface RunRecord {
  snapshotId: string;
  branch: string;
  commitSha: string;
  files: number;
  functions: number;
  endpoints: number;
  dbSchemas: number;
  tests: number;
  nodeCount: number;
  edgeCount: number;
}

const GRAPH_BUCKET = 'graphs';

class SupabaseStore {
  private client: SupabaseClient | null = null;
  private url: string;
  private key: string;
  // 'service' bypasses RLS (can write on any owner's behalf); 'anon' is
  // RLS-restricted and can only write with a user's JWT.
  private keyType: 'service' | 'anon' | 'none' = 'none';

  constructor() {
    this.url = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    this.key = serviceKey || anonKey;
    this.keyType = serviceKey ? 'service' : anonKey ? 'anon' : 'none';
    if (this.url && this.key) {
      this.client = createClient(this.url, this.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** True when the server can write on a user's behalf (service-role key set). */
  canPersistServerSide(): boolean {
    return this.keyType === 'service';
  }

  getStatus(): { configured: boolean; keyType: string; url: string } {
    return {
      configured: this.isConfigured(),
      keyType: this.keyType,
      // host only, never the key
      url: this.url ? this.url.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co' : '',
    };
  }

  /** Lightweight reachability check against the project's REST endpoint. */
  async ping(): Promise<{ reachable: boolean; error?: string }> {
    if (!this.client) return { reachable: false, error: 'not configured' };
    try {
      // A count query on a real table; RLS may return 0 rows but the request
      // succeeding proves the project + key are valid and reachable.
      const { error } = await this.client.from('repositories').select('id', { count: 'exact', head: true });
      if (error && !/permission|row-level|rls/i.test(error.message)) {
        return { reachable: false, error: error.message };
      }
      return { reachable: true };
    } catch (err: any) {
      return { reachable: false, error: err.message };
    }
  }

  /** Resolve a Supabase user id from a bearer JWT (from Supabase Auth). */
  async getUserId(accessToken?: string): Promise<string | null> {
    if (!this.client || !accessToken) return null;
    try {
      const { data, error } = await this.client.auth.getUser(accessToken);
      if (error || !data?.user) return null;
      return data.user.id;
    } catch {
      return null;
    }
  }

  /** Upsert a repository for an owner and return its id. */
  async upsertRepository(
    owner: string,
    repo: { name: string; source: 'local' | 'git'; gitUrl?: string; localPath?: string; branch?: string }
  ): Promise<string | null> {
    if (!this.client) return null;
    const { data, error } = await this.client
      .from('repositories')
      .upsert(
        {
          owner,
          name: repo.name,
          source: repo.source,
          git_url: repo.gitUrl || null,
          local_path: repo.localPath || null,
          default_branch: repo.branch || 'main',
        },
        { onConflict: 'owner,name' }
      )
      .select('id')
      .single();
    if (error) {
      console.warn(`[supabase] upsertRepository failed: ${error.message}`);
      return null;
    }
    return data?.id ?? null;
  }

  /** Record an analysis run (snapshot) for an owner + repository. */
  async recordRun(owner: string, repositoryId: string, run: RunRecord): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.from('analysis_runs').insert({
      owner,
      repository_id: repositoryId,
      snapshot_id: run.snapshotId,
      branch: run.branch,
      commit_sha: run.commitSha,
      status: 'Completed',
      files: run.files,
      functions: run.functions,
      endpoints: run.endpoints,
      db_schemas: run.dbSchemas,
      tests: run.tests,
      node_count: run.nodeCount,
      edge_count: run.edgeCount,
    });
    if (error) console.warn(`[supabase] recordRun failed: ${error.message}`);
  }

  /** Save a graph JSON blob to Storage and record a pointer row. */
  async saveGraph(
    owner: string,
    repositoryId: string,
    snapshotId: string,
    graphJson: string,
    counts: { nodeCount: number; edgeCount: number }
  ): Promise<void> {
    if (!this.client) return;
    const storagePath = `${owner}/${repositoryId}/${snapshotId}.json`;
    const up = await this.client.storage
      .from(GRAPH_BUCKET)
      .upload(storagePath, graphJson, { contentType: 'application/json', upsert: true });
    if (up.error) {
      console.warn(`[supabase] graph upload failed: ${up.error.message}`);
      return;
    }
    const { error } = await this.client.from('graphs').upsert(
      {
        owner,
        repository_id: repositoryId,
        snapshot_id: snapshotId,
        storage_path: storagePath,
        node_count: counts.nodeCount,
        edge_count: counts.edgeCount,
      },
      { onConflict: 'repository_id,snapshot_id' }
    );
    if (error) console.warn(`[supabase] saveGraph pointer failed: ${error.message}`);
  }

  /** Load a persisted graph blob (latest snapshot for a repo, or a specific one). */
  async loadGraph(owner: string, repositoryId: string, snapshotId?: string): Promise<string | null> {
    if (!this.client) return null;
    let path = snapshotId ? `${owner}/${repositoryId}/${snapshotId}.json` : '';
    if (!path) {
      const { data } = await this.client
        .from('graphs')
        .select('storage_path')
        .eq('repository_id', repositoryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.storage_path) return null;
      path = data.storage_path;
    }
    const dl = await this.client.storage.from(GRAPH_BUCKET).download(path);
    if (dl.error || !dl.data) return null;
    return await dl.data.text();
  }

  /** List an owner's repositories. */
  async listRepositories(owner: string) {
    if (!this.client) return [];
    const { data } = await this.client
      .from('repositories')
      .select('*')
      .eq('owner', owner)
      .order('updated_at', { ascending: false });
    return data ?? [];
  }

  /**
   * Serverless "active graph" persistence. On stateless hosts (Vercel) the
   * in-memory graph doesn't survive between function invocations, so after each
   * analysis we mirror the whole graph to a single shared blob and reload it on
   * a cold request. Uses the service key (bypasses RLS) at a fixed path.
   */
  async saveActiveGraph(json: string): Promise<void> {
    if (!this.client) return;
    const up = await this.client.storage
      .from(GRAPH_BUCKET)
      .upload('active/graph.json', json, { contentType: 'application/json', upsert: true });
    if (up.error) console.warn(`[supabase] saveActiveGraph failed: ${up.error.message}`);
  }

  async loadActiveGraph(): Promise<string | null> {
    if (!this.client) return null;
    try {
      const dl = await this.client.storage.from(GRAPH_BUCKET).download('active/graph.json');
      if (dl.error || !dl.data) return null;
      return await dl.data.text();
    } catch {
      return null;
    }
  }

  /** List an owner's recent analysis runs. */
  async listRuns(owner: string, limit = 40) {
    if (!this.client) return [];
    const { data } = await this.client
      .from('analysis_runs')
      .select('*, repositories(name)')
      .eq('owner', owner)
      .order('started_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }
}

export const supabaseStore = new SupabaseStore();
