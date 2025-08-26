import fs from 'fs';
import path from 'path';

// Normalize statuses across PW JSON variants
function normStatus(s) {
  if (!s) return 'unknown';
  const t = String(s).toLowerCase();
  if (t === 'expected' || t === 'pass' || t === 'passed') return 'passed';
  if (t === 'unexpected' || t === 'fail' || t === 'failed') return 'failed';
  if (t === 'skipped') return 'skipped';
  return 'unknown';
}

// Prefer artifacts/report.json; fall back to common names
const root = process.cwd();
const candidates = [
  path.join(root, 'artifacts', 'report.json'),
  path.join(root, 'report.json'),
  path.join(root, 'artifacts', 'playwright-report.json'),
  path.join(root, 'artifacts', 'test-results.json'),
];
const jsonPath = candidates.find(p => fs.existsSync(p));
if (!jsonPath) {
  console.error('❌ Could not find Playwright JSON report. Run `npm run test:smoke` first.');
  process.exit(1);
}
const pw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Build title -> status map (supports PW v1.55 shape: suites -> specs -> tests -> results)
const testStatus = new Map();

function statusFromSpec(spec) {
  let sawPass = false, sawFail = false;
  if (Array.isArray(spec?.tests)) {
    for (const t of spec.tests) {
      const r = (t.results && t.results[0]) || {};
      const raw = r.status ?? r.outcome ?? t.status ?? t.outcome ?? t.expectedStatus;
      const s = normStatus(raw);
      if (s === 'failed') sawFail = true;
      if (s === 'passed') sawPass = true;
    }
  } else if (typeof spec?.ok === 'boolean') {
    return spec.ok ? 'passed' : 'failed';
  }
  if (sawFail) return 'failed';
  if (sawPass) return 'passed';
  return 'unknown';
}

function walkSuites(suites) {
  if (!Array.isArray(suites)) return;
  for (const s of suites) {
    if (Array.isArray(s?.specs)) {
      for (const spec of s.specs) {
        const title = (spec?.title ?? '').trim();
        if (title) testStatus.set(title, statusFromSpec(spec));
      }
    }
    if (Array.isArray(s?.suites)) walkSuites(s.suites);
  }
}
walkSuites(pw.suites);

// Fallback brute walker for older shapes
function bruteWalk(node, parentTitle) {
  if (node == null) return;
  if (Array.isArray(node)) return node.forEach(n => bruteWalk(n, parentTitle));
  if (typeof node !== 'object') return;

  const selfTitle = typeof node.title === 'string' ? node.title : parentTitle;
  if (selfTitle && Array.isArray(node.tests)) {
    const specLike = { title: selfTitle, tests: node.tests };
    const st = statusFromSpec(specLike);
    if (!testStatus.has(selfTitle)) testStatus.set(selfTitle, st);
  }
  for (const k of Object.keys(node)) {
    if (k === 'tests') continue;
    bruteWalk(node[k], selfTitle);
  }
}
if (testStatus.size === 0) bruteWalk(pw);

// Map tests → human scenarios (regexes must match your test titles)
const scenarios = [
  { id: 'reach',       text: 'Portal URL loads successfully and title renders.',                                tests: [/site is reachable/i] },
  { id: 'login-ok',    text: 'Valid user can login and land on products/dashboard page.',                      tests: [/login with valid credentials/i] },
  { id: 'login-bad',   text: 'Invalid credentials show an error and do not start a session.',                  tests: [/login with invalid credentials/i] },
  { id: 'nav-about',   text: 'Open menu and navigate to About.',                                               tests: [/can open menu and navigate to About/i] },
  { id: 'nav-logout',  text: 'Logout returns user to login page.',                                             tests: [/logout brings user back to login page/i] },
  { id: 'ui-products', text: 'Dashboard shows Products, at least one item, and no severe console errors.',     tests: [/dashboard renders products and has no console errors/i] },
  { id: 'cart-badge',  text: 'Add to cart updates badge; removing clears it.',                                 tests: [/add to cart updates badge then remove clears it/i] },
];

function scenarioStatus(s) {
  const titles = Array.from(testStatus.keys());
  const matching = titles.filter(t => s.tests.some(rx => rx.test(t)));
  const failing = [];
  if (matching.length === 0) failing.push('No matching tests found');
  else {
    for (const t of matching) {
      const st = (testStatus.get(t) || 'unknown').toLowerCase();
      if (st !== 'passed') failing.push(`${t} → ${st}`);
    }
  }
  return { ok: failing.length === 0, failing };
}

// Write smoke_scenarios.md
const lines = ['# Smoke Test Scenarios – Passport POC (auto-generated)', ''];
for (const s of scenarios) {
  const { ok, failing } = scenarioStatus(s);
  lines.push(`- ${ok ? '[x]' : '[ ]'} ${s.text}`);
  if (!ok) lines.push(`  - ❌ Issues: ${failing.join(' | ')}`);
}
lines.push('', `> Source: Playwright JSON report → ${path.basename(jsonPath)}`);
lines.push(`> Updated: ${new Date().toISOString()}`);

const outPath = path.join(root, 'smoke_scenarios.md');
fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log('✅ Updated', outPath);
