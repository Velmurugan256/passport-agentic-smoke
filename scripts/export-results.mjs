import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const artifactsDir = path.resolve('artifacts');
const candidates = [
  path.join(artifactsDir, 'report.json'),
  path.join(process.cwd(), 'report.json'),
  path.join(artifactsDir, 'playwright-report.json'),
  path.join(artifactsDir, 'test-results.json'),
];
const jsonPath = candidates.find(p => fs.existsSync(p));
if (!jsonPath) {
  console.error('❌ Could not find Playwright JSON report in artifacts/. Run tests first.');
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const rows = []; // {suite, test, status, durationMs, error?, attachments?}

function norm(s) {
  if (!s) return 'unknown';
  const t = String(s).toLowerCase();
  if (t === 'expected') return 'passed';
  if (t === 'unexpected') return 'failed';
  return t;
}

// Walk modern shape: suites -> specs -> tests -> results
function collectFromSuites(suites) {
  if (!Array.isArray(suites)) return false;
  let found = false;
  for (const s of suites) {
    const suiteName = s.title || s.file || 'suite';
    if (Array.isArray(s.specs)) {
      found = true;
      for (const spec of s.specs) {
        const testName = spec.title || 'test';
        for (const t of spec.tests || []) {
          for (const r of t.results || []) {
            const status = norm(r.status || r.outcome);
            const duration = r.duration ?? r.durationMs ?? 0;
            const attach = (r.attachments || []).map(a => a.path || a.name).filter(Boolean).join(' | ');
            const errMsgs = (r.errors || []).map(e => e.message || String(e));
            rows.push({
              suite: suiteName,
              test: testName,
              status,
              durationMs: duration,
              error: (r.error?.message || errMsgs.join(' || ')) || ''
            , attachments: attach
            });
          }
        }
      }
    }
    if (Array.isArray(s.suites)) {
      if (collectFromSuites(s.suites)) found = true;
    }
  }
  return found;
}

let got = collectFromSuites(json.suites);

// Fallback brute walk for other shapes
function brute(node, suiteName = 'root') {
  if (node == null) return;
  if (Array.isArray(node)) return node.forEach(n => brute(n, suiteName));
  if (typeof node !== 'object') return;

  const name = node.title || node.name || suiteName;
  if (Array.isArray(node.tests)) {
    got = true;
    for (const t of node.tests) {
      const testName = t.title || t.name || 'test';
      for (const r of t.results || []) {
        const status = norm(r.status || r.outcome);
        const duration = r.duration ?? r.durationMs ?? 0;
        const attach = (r.attachments || []).map(a => a.path || a.name).filter(Boolean).join(' | ');
        const errMsgs = (r.errors || []).map(e => e.message || String(e));
        rows.push({
          suite: name,
          test: testName,
          status,
          durationMs: duration,
          error: (r.error?.message || errMsgs.join(' || ')) || '',
          attachments: attach
        });
      }
    }
  }
  for (const k of Object.keys(node)) {
    if (k === 'tests') continue;
    brute(node[k], name);
  }
}
if (!got) brute(json);

// CSV
const csvHeader = 'Suite,Test,Status,Duration(ms),Error,Attachments\n';
const csv = csvHeader + rows.map(r =>
  [
    String(r.suite).replace(/,/g, ';'),
    String(r.test).replace(/,/g, ';'),
    r.status,
    r.durationMs,
    (r.error || '').replace(/[\r\n,]/g, ' ').slice(0, 500),
    (r.attachments || '').replace(/[\r\n]/g, ' ')
  ].join(',')
).join('\n');

if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
const csvPath = path.join(artifactsDir, 'smoke_results.csv');
fs.writeFileSync(csvPath, csv, 'utf-8');

// XLSX
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'Results');
const xlsxPath = path.join(artifactsDir, 'smoke_results.xlsx');
XLSX.writeFile(wb, xlsxPath);

console.log('✅ Wrote:');
console.log(' -', csvPath);
console.log(' -', xlsxPath);
