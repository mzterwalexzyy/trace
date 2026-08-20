import { HydraDBClient } from './src/core/hydradb/client.js';
import { RepositoryAnalyzer } from './src/core/parser/analyzer.js';
import { IntersectionEngine } from './src/core/impact/intersection.js';

const db = new HydraDBClient();
const t0 = Date.now();
const res = new RepositoryAnalyzer({ repoPath: '../veyra' }, db).analyze();
console.log(`analyze: ${res.nodeCount} nodes, ${res.edgeCount} edges in ${Date.now()-t0}ms`);
const fns = db.findNodes(n => n.type==='Function'||n.type==='Method');
const target = fns.map(f=>({f,deg:db.getInboundEdges(f.id).length+db.getOutboundEdges(f.id).length})).sort((a,b)=>b.deg-a.deg)[0]?.f;
console.log(`target: ${target?.name}`);
const eng = new IntersectionEngine(db);
const t1 = Date.now();
const report = await eng.generateReportAsync(target.id, 6);
console.log(`impact in ${Date.now()-t1}ms | totalPaths=${report.totalPaths} affected=${report.totalAffectedNodes} verified=${report.verifiedPathCount} unobserved=${report.unobservedPathCount} endpoints=${report.endpoints.length}`);
