import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const artifactsDir = path.resolve('artifacts');
const candidates = [
  path.join(artifactsDir, 'test-results.json'),
  path.join(artifactsDir, 'report.json'),
  path.join(artifactsDir, 'playwright-report.json')
];

const jsonPath = candidates.find(p => fs.existsSync(p));
if (!jsonPath) {
  console.error('❌ Could not find Playwright JSON report in artifacts/. Make sure --reporter=json ran.');
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Normalized rows: Suite → Test → Result
type Row = {
  suite: string;
  test: string;
  status: string;
  durationMs: number;
  error?: string;
  attachments?: string;
};

const rows: Row[] = [];

function collect(node: any, suiteName = '') {
  if (!node) return;
  // PW JSON changes slightly across versions; try common shapes
  const name = node.title || node.name || suiteName;
  if (node.suites) node.suites.forEach((s: any) => collect(s, name || suiteName));
  if (node.tests) {
    node.tests.forEach((t: any) => {
      const testName = t.title || t.name;
      (t.results || []).forEach((r: any) => {
        const status = r.status || r.outcome || 'unknown';
        const duration = r.duration || r.durationMs || 0;
        const errors = (r.error ? [r.error.message || r.error] : [])
          .concat((r.errors || []).map((e: any) => e.message || String(e)));
        const attachList = (r.attachments || [])
          .map((a: any) => a.path || a.name)
          .filter(Boolean)
          .join(' | ');
        rows.push({
          suite: name || 'root',
          test: testName,
          status,
          durationMs: duration,
          error: errors.filter(Boolean).join(' || ') || undefined,
          attachments: attachList || undefined
        });
      });
    });
  }
}
collect(json);

// Write CSV
const csvHeader = 'Suite,Test,Status,Duration(ms),Error,Attachments\n';
const csv = csvHeader + rows.map(r =>
  [
    r.suite.replace(/,/g, ';'),
    r.test.replace(/,/g, ';'),
    r.status,
    r.durationMs,
    (r.error || '').replace(/[\r\n,]/g, ' ').slice(0, 500),
    (r.attachments || '').replace(/[\r\n]/g, ' ')
  ].join(',')
).join('\n');

const outDir = artifactsDir;
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const csvPath = path.join(outDir, 'smoke_results.csv');
fs.writeFileSync(csvPath, csv, 'utf-8');

// Write Excel
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'Results');
const xlsxPath = path.join(outDir, 'smoke_results.xlsx');
XLSX.writeFile(wb, xlsxPath);

console.log('✅ Wrote:');
console.log(' -', csvPath);
console.log(' -', xlsxPath);
