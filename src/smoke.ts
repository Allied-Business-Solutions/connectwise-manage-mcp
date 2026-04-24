/**
 * Smoke test — hits 5 read-only CWM endpoints and reports pass/fail.
 * Run with: npm run smoke
 * Requires real credentials in environment. Never run in CI.
 *
 * Guard: will refuse to run unless SMOKE_TEST=1 is set.
 */
import { config } from 'dotenv';
config(); // load .env if present
import { loadEnv } from './utils/env.js';
import { initClient, cwmGet } from './client/cwmClient.js';

if (process.env['SMOKE_TEST'] !== '1') {
  process.stderr.write('Set SMOKE_TEST=1 to run smoke tests\n');
  process.exit(1);
}

interface SmokeResult {
  name: string;
  path: string;
  ok: boolean;
  status?: number | undefined;
  error?: string | undefined;
  sample?: unknown;
}

async function runSmoke(): Promise<void> {
  const env = loadEnv();
  initClient(env);

  type SmokeTest = { name: string; path: string; params?: Record<string, string | number | boolean> };
  const tests: SmokeTest[] = [
    { name: 'system info', path: '/system/info' },
    { name: 'service boards', path: '/service/boards', params: { pageSize: 5, fields: 'id,name' } },
    { name: 'open tickets', path: '/service/tickets', params: { conditions: 'closedFlag=false', pageSize: 3, fields: 'id,summary,status' } },
    { name: 'members', path: '/system/members', params: { pageSize: 5, fields: 'id,identifier,firstName,lastName', conditions: 'inactiveFlag=false' } },
    { name: 'priorities', path: '/service/priorities', params: { pageSize: 10, fields: 'id,name' } },
  ];

  const results: SmokeResult[] = [];

  for (const test of tests) {
    try {
      const res = await cwmGet<unknown>(test.path, test.params);
      const data = res.data;
      const sample = Array.isArray(data) ? data.slice(0, 2) : data;
      results.push({ name: test.name, path: test.path, ok: true, status: res.status, sample });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { httpStatus?: number }).httpStatus;
      results.push({ name: test.name, path: test.path, ok: false, status, error: message });
    }
  }

  console.log('\n=== ConnectWise MCP Smoke Tests ===\n');
  let passed = 0;
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const status = r.status ? ` [${r.status}]` : '';
    console.log(`${icon} ${r.name}${status}: ${r.path}`);
    if (!r.ok) {
      console.log(`  ERROR: ${r.error}`);
    } else if (r.sample) {
      console.log(`  Sample: ${JSON.stringify(r.sample).slice(0, 120)}`);
    }
    if (r.ok) passed++;
  }

  console.log(`\n${passed}/${results.length} tests passed`);
  process.exit(passed === results.length ? 0 : 1);
}

runSmoke().catch((err) => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
