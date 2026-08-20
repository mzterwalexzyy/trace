import { ChangeImpactReport } from '../impact/intersection.js';

export function formatTextImpactReport(report: ChangeImpactReport): string {
  const lines: string[] = [];

  lines.push('TRACE CHANGE IMPACT');
  lines.push('──────────────────────────────────────────────────');
  lines.push(`Storage Driver: ${report.storageMode.mode} [${report.storageMode.sdkPackage}]`);
  lines.push('');
  lines.push(`Changed Symbol:`);
  lines.push(`  ${report.targetSymbol.name} (${report.targetSymbol.filePath || 'unknown file'}:${report.targetSymbol.startLine || 1})`);
  lines.push('');
  lines.push(`Potential Impact:`);
  lines.push(`  ${report.totalAffectedNodes} nodes (${report.totalPaths} reachable paths)`);
  lines.push('');
  lines.push(`Runtime Verified:`);
  lines.push(`  ✓ ${report.verifiedPathCount} paths executed in recorded traces`);
  lines.push('');
  lines.push(`No Runtime Evidence:`);
  lines.push(`  ⚠ ${report.unobservedPathCount} paths without execution evidence`);
  lines.push('');

  lines.push('API ENDPOINTS:');
  if (report.endpoints.length === 0) {
    lines.push('  (No API endpoints directly impacted)');
  } else {
    for (const ep of report.endpoints) {
      const badge = ep.status === 'VERIFIED' ? '✓' : '⚠';
      const detail = ep.status === 'VERIFIED' ? `[VERIFIED - ${ep.traceCount} trace executions]` : '[UNOBSERVED - no runtime evidence]';
      lines.push(`  ${badge} ${ep.endpointNode.name} ${detail}`);
    }
  }
  lines.push('');

  lines.push('DATABASE & SCHEMAS:');
  if (report.dbSchemas.length === 0) {
    lines.push('  (No database schema operations impacted)');
  } else {
    for (const db of report.dbSchemas) {
      lines.push(`  • ${db.name} (${db.filePath || 'schema'})`);
    }
  }
  lines.push('');

  lines.push('TEST COVERAGE:');
  if (report.tests.length === 0) {
    lines.push('  ⚠ (No unit tests associated with affected paths)');
  } else {
    for (const t of report.tests) {
      const badge = t.hasExecuted ? '✓' : '⚠';
      const statusText = t.hasExecuted ? '[EXECUTED]' : '[NOT EXECUTED IN TRACES]';
      lines.push(`  ${badge} ${t.node.name} ${statusText}`);
    }
  }
  lines.push('');

  if (report.hydraContext && report.hydraContext.length > 0) {
    lines.push('HYDRADB CONTEXT ENRICHMENT:');
    for (const ctx of report.hydraContext) {
      lines.push(`  • [Score: ${ctx.score.toFixed(2)}] ${ctx.content.substring(0, 100)}...`);
    }
    lines.push('');
  }

  lines.push('RISK SUMMARY:');
  lines.push('──────────────────────────────────────────────────');
  lines.push(`• ${report.riskSummary.affectedEndpointsCount} API surface(s) potentially affected`);
  lines.push(`• ${report.riskSummary.unobservedPathsCount} path(s) lack runtime evidence`);
  lines.push(`• ${report.riskSummary.testCoverageCount} test(s) cover the affected execution graph`);
  lines.push('');

  return lines.join('\n');
}
