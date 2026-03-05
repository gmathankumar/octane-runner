#!/usr/bin/env node

'use strict';

const path  = require('path');
const fs    = require('fs');
const { extractTestNamesFromCommit } = require('../lib/patch');
const { runOctaneLinks }             = require('../lib/octane');
const { parseCSV }                   = require('../lib/csv');

// ─── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
octane-runner — Link ALM Octane tests to a work item

USAGE
  # From a git commit (recommended)
  octane-runner --commit <hash> --session session.json --config config.json

  # From a CSV of test names
  octane-runner --data data.csv --session session.json --config config.json

OPTIONS
  --commit <hash>      Git commit hash (short or full). Runs git show in CWD.
  --data   <file>      CSV file with a "testName" column (alternative to --commit)
  --session <file>     Path to session.json  [default: session.json]
  --config  <file>     Path to config.json   [default: config.json]
  --delay  <ms>        Milliseconds between requests  [default: 300]
  --dry-run            Parse & print what would happen, without firing requests
  --help               Show this help

SESSION.JSON (gitignore this file — contains secrets)
  {
    "cookie":      "<full cookie string>",
    "xsrf-header": "<xsrf token>",
    "ptal":        "<ptal value>"
  }

CONFIG.JSON (safe to commit)
  {
    "searchUrl":  "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/<sid>/workspaces/<wid>/tests?fields=...&query=...",
    "updateUrl":  "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/<sid>/workspaces/<wid>/tests",
    "workItemId": "1809072"
  }
`.trim();

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    if (a.startsWith('--')) {
      out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--'))
        ? argv[++i]
        : true;
    }
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const args = parseArgs(process.argv.slice(2));

  const SESSION_FILE = args['session'] || 'session.json';
  const CONFIG_FILE  = args['config']  || 'config.json';
  const DELAY_MS     = parseInt(args['delay'] || '300', 10);
  const DRY_RUN      = args['dry-run'] === true;
  const COMMIT       = args['commit'];
  const DATA_FILE    = args['data'];

  if (!COMMIT && !DATA_FILE) {
    console.error('ERROR  Must provide either --commit <hash> or --data <file>\n');
    console.log(HELP);
    process.exit(1);
  }

  if (COMMIT && DATA_FILE) {
    console.error('ERROR  --commit and --data are mutually exclusive\n');
    process.exit(1);
  }

  // ── Load config ─────────────────────────────────────────────────────────────
  const config  = loadJSON(CONFIG_FILE);
  assertFields(config,  ['searchUrl', 'updateUrl', 'workItemId'], CONFIG_FILE);

  const session = loadJSON(SESSION_FILE);
  assertFields(session, ['cookie', 'xsrf-header'], SESSION_FILE);

  // ── Resolve test names ───────────────────────────────────────────────────────
  let testNames;

  if (COMMIT) {
    log('info', `Mode       : git commit ${COMMIT}`);
    testNames = await extractTestNamesFromCommit(COMMIT);
    if (testNames.length === 0) {
      log('warn', 'No test names matching test_* found in the commit diff. Exiting.');
      process.exit(0);
    }
    log('info', `Tests found: ${testNames.length}`);
    testNames.forEach(n => log('info', `  · ${n}`));
    console.log('');
  } else {
    log('info', `Mode       : CSV ${DATA_FILE}`);
    const rows = parseCSV(fs.readFileSync(path.resolve(DATA_FILE), 'utf8'));
    testNames  = rows
      .map(r => r['testName'] || r['TestName'] || r['test_name'])
      .filter(Boolean);
    if (testNames.length === 0) {
      log('warn', 'No testName values found in CSV. Exiting.');
      process.exit(0);
    }
    log('info', `Tests found: ${testNames.length}\n`);
  }

  log('info', `Config     : ${CONFIG_FILE}`);
  log('info', `Session    : ${SESSION_FILE}`);
  log('info', `Work item  : ${config.workItemId}`);
  log('info', `Delay      : ${DELAY_MS}ms`);
  if (DRY_RUN) log('warn', 'DRY RUN    : no requests will be sent');
  console.log('');

  // ── Run ──────────────────────────────────────────────────────────────────────
  await runOctaneLinks({ testNames, config, session, delayMs: DELAY_MS, dryRun: DRY_RUN });
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`ERROR  File not found: ${resolved}`);
    process.exit(1);
  }
  try {
    // Strip _instructions and comments before parsing
    const raw = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`ERROR  Could not parse ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

function assertFields(obj, fields, filename) {
  const missing = fields.filter(f => !obj[f] || obj[f].startsWith('PASTE_'));
  if (missing.length) {
    console.error(`ERROR  ${filename} is missing or has unfilled fields: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function log(level, msg) {
  const p = { info: '\x1b[36mINFO\x1b[0m', warn: '\x1b[33mWARN\x1b[0m', error: '\x1b[31mERROR\x1b[0m' };
  console.log(`${p[level] || level}  ${msg}`);
}
