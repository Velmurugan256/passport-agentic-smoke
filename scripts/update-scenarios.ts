import * as fs from 'fs';
import * as path from 'path';

/**
 * Works with Playwright JSON (v1.55+):
 * - Titles live at suites[].specs[].title
 * - Per-project runs under specs[].tests[].results[]
 * Also supports older shapes by walking the tree.
 */

type PWAttachment = { name?: string; path?: string; contentType?: string };
type PWResult = {
  status?: string;          // 'passed' | 'failed' | 'skipped' | 'expected' | 'unexpected'
  outcome?: string;
  duration?: number;
  durationMs?: number;
  error?: any;
  errors?: any[];
  attachments?: PWAttachment[];
};
type PWPerProjectTest = {
  expectedStatus?: string;  // often 'passed'
  status?: string;          // sometimes here
  outcome?: string;
  results?: PWResult[];
};
type PWSpec = {
  title?: string;           // ✅ real test title lives here in 1.55 JSON
  ok?: boolean;
  tests?: PWPerProjectTest[];
};
type PWSuite = {
  title?: string;
  file?: string;
  specs?: PWSpec[];
  suites?: PWSuite[];
};
type PWJson = {
  config?: any;
  suites?: PWSuite[];
  [k: string]: any;
};

function normalizeStatus(s?: string): 'passed' | 'failed' | 'skipped' | 'unknown' {
  if (!s) return 'unknown';
  const t = s.toLowerCase();
  if (t === 'expected') return 'passed';
  if (t === 'unexpected') return 'failed';
  if (t === 'pass' || t === 'passed') return 'passed';
  if (t === 'fail' || t === 'failed') return 'failed';
  if (t === 'skipped') return 'skipped';
  return 'unknown';
}

function statusFromSpec(spec: PWSpec): 'passed' | 'failed' | 'skipped' | 'unknown' {
  // Aggregate per-project statuses (e.g., chromium, firefox)
  let sawPass = false;
  let sawFail = false;

  if (Array.isArray(spec.tests)) {
    for (const t of spec.tests) {
      // Prefer first result
      const r: PWResult | undefined = (t.results && t.results[0]) || undefined;
      const raw = r?.status || r?.outcome || t.status || t.outcome || t.expectedStatus;
      const s = normalizeStatus(raw);
      if (s === 'failed') sawFail = true;
      if (s === 'passed') sawPass = true;
    }
  } else if (typeof spec.ok === 'boolean') {
    // Fallback: some schemas expose ok: true/false
    return spec.ok ? 'passed' : 'failed';
  }

  if (sawFail) return 'failed';
  if (sawPass) return 'passed';
  return 'unknown';
}

// ---- Load report.json ----
const root = process.cwd();
const candidates = [
  path.join(root, 'artifacts', 'report.json'), // from playwright.config.ts
  path.join(root, 'report.json'),
  path.join(root, 'artifacts', 'playwright-report.json'),
  path.join(root, 'artifacts', 'test-results.json'),
];

const jsonPath = candidates.find(p => fs.existsSync(p));
if (!jsonPath) {
  console.error('❌ Could not find Playwright JSON report. Run `npm run test:smoke` first.');
  process.exit(1);
}

const pw: PWJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// ---- Build title → status map ----
const testStatus = new Map<string, string>();

function walkSuites(suites?: PWSuite[]) {
  if (!Array.isArray(suites)) return;
  for (const s of suites) {
    // Handle modern shape: suites[].specs[]
    if (Array.isArray(s.specs)) {
      for (const spec of s.specs) {
        const title = (spec.title || '').trim();
        if (title) {
          const st = statusFromSpec(spec);
          testStatus.set(title, st);
        }
      }
    }
    // Recurse nested suites, if any
    if (Array.isArray(s.suites)) walkSuites(s.suites);
  }
}

// Start with modern shape
walkSuites(pw.suites);

// Fallback: brute-force walk (older/other shapes)
// Picks up any object that has a "tests" array AND a "title" (use the parent's title if needed)
function bruteWalk(node: any, parentTitle?: string) {
  if (node == null) return;
  if (Array.isArray(node)) { node.forEach(n => bruteWalk(n, parentTitle)); return; }
  if (typeof node !== 'object') return;

  const selfTitle = typeof node.title === 'string' ? node.title : parentTitle;

  // If this object looks like a SPEC: has title and tests
  if (selfTitle && Array.isArray(node.tests)) {
    const specLike: PWSpec = { title: selfTitle, tests: node.tests };
    const st = statusFromSpec(specLike);
    if (!testStatus.has(selfTitle)) testStatus.set(selfTitle, st);
  }

  for (const k of Object.keys(node)) {
    if (k === 'tests') continue;
    bruteWalk(node[k], selfTitle);
  }
}

// Only brute-walk if nothing found yet
if (testStatus.size === 0) bruteWalk(pw);

// ---- Map tests → scenarios ----
type Scenario = { id: string; text: string; tests: RegExp[] };

const scenarios: Scenario[] = [
  { id: 'reach',       text: 'Portal URL loads successfully and title renders.',                                tests: [/site is reachable/i] },
  { id: 'login-ok',    text: 'Valid user can login and land on products/dashboard page.',                      tests: [/login with valid credentials/i] },
  { id: 'login-bad',   text: 'Invalid credentials show an error and do not start a session.',                  tests: [/login with invalid credentials/i] },
  { id: 'nav-about',   text: 'Open menu and navigate to About.',                                               tests: [/can open menu and navigate to About/i] },
  { id: 'nav-logout',  text: 'Logout returns user to login page.',                                             tests: [/logout brings user back to login page/i] },
  { id: 'ui-products', text: 'Dashboard shows Products, at least one item, and no severe console errors.',     tests: [/dashboard renders products and has no console errors/i] },
  { id: 'cart-badge',  text: 'Add to cart updates badge; removing clears it.',                                 tests: [/add to cart updates badge then remove clears it/i] },
];

function scenarioStatus(s: Scenario): { ok: boolean; failing: string[] } {
  const titles = Array.from(testStatus.keys());
  const matching = titles.filter(t => s.tests.some(rx => rx.test(t)));
  const failing: string[] = [];

  if (matching.length === 0) failing.push('No matching tests found');
  else {
    for (const t of matching) {
      const st = (testStatus.get(t) || 'unknown').toLowerCase();
      if (st !== 'passed') failing.push(`${t} → ${st}`);
    }
  }
  return { ok: failing.length === 0, failing };
}

// ---- Render markdown ----
const md: string[] = [];
md.push('# Smoke Test Scenarios – Passport POC (auto-generated)', '');

for (const s of scenarios) {
  const { ok, failing } = scenarioStatus(s);
  md.push(`- ${ok ? '[x]' : '[ ]'} ${s.text}`);
  if (!ok) md.push(`  - ❌ Issues: ${failing.join(' | ')}`);
}

md.push('', `> Source: Playwright JSON report → ${path.basename(jsonPath)}`);
md.push(`> Updated: ${new Date().toISOString()}`);

const outPath = path.join(root, 'smoke_scenarios.md');
fs.writeFileSync(outPath, md.join('\n'), 'utf-8');
console.log('✅ Updated', outPath);
