#!/usr/bin/env node

'use strict';

const path  = require('path');
const fs    = require('fs');
const { extractTestNamesFromCommit } = require('../lib/patch');
const { runOctaneLinks }             = require('../lib/octane');
const { parseCSV }                   = require('../lib/csv');
const { parseCurlCommand }           = require('../lib/curl-parser');

// ─── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
octane-runner — Link ALM Octane tests to a work item

USAGE
  # From a git commit (recommended)
  octane-runner --commit <hash> --curl request.curl --config config.json

  # From a CSV of test names
  octane-runner --data data.csv --curl request.curl --config config.json

OPTIONS
  --curl <file>              Path to copied cURL (bash) file; auth read directly
  --commit <hash>            Git commit hash (short or full). Runs git show in CWD.
  --data   <file>            CSV file with a "testName" column (alternative to --commit)
  --config  <file>           Path to config.json   [default: config.json]
  --delay  <ms>              Milliseconds between requests  [default: 300]
  --dry-run                  Parse & print what would happen, without firing requests
  --help                     Show this help

CONFIG.JSON (safe to commit)
  {
    "searchUrl":         "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/<sid>/workspaces/<wid>/tests?fields=...&query=...",
    "updateUrl":         "https://almoctane-eur.saas.microfocus.com/api/shared_spaces/<sid>/workspaces/<wid>/tests",
    "workItemId":        "1809072",
    "testNameRegex":     "^\\+.*\\b(test_[a-zA-Z0-9_]+)\\s*\\("
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

  const CONFIG_FILE  = args['config']  || 'config.json';
  const DELAY_MS     = parseInt(args['delay'] || '300', 10);
  const DRY_RUN      = args['dry-run'] === true;
  const COMMIT       = args['commit'];
  const DATA_FILE    = args['data'];
  const CURL_FILE    = args['curl'];

  if (!COMMIT && !DATA_FILE) {
    console.error('ERROR  Must provide either --commit <hash> or --data <file>\n');
    console.log(HELP);
    process.exit(1);
  }

  if (COMMIT && DATA_FILE) {
    console.error('ERROR  --commit and --data are mutually exclusive\n');
    process.exit(1);
  }

  if (!CURL_FILE) {
    console.error('ERROR  Must provide --curl <file>\n');
    console.log(HELP);
    process.exit(1);
  }

  // ── Load config ─────────────────────────────────────────────────────────────
  const config  = loadJSON(CONFIG_FILE);
  assertFields(config,  ['searchUrl', 'updateUrl', 'workItemId'], CONFIG_FILE);

  const auth = loadAuthFromCurl(CURL_FILE);

  // ── Resolve test names ───────────────────────────────────────────────────────
  let testNames;

  if (COMMIT) {
    log('info', `Mode       : git commit ${COMMIT}`);
    testNames = await extractTestNamesFromCommit(COMMIT, config.testNameRegex);
    if (testNames.length === 0) {
      log('warn', 'No test names matching the configured regex were found in the commit diff. Exiting.');
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
  log('info', `Auth       : cURL ${CURL_FILE}`);
  if (auth['octane-client-version']) log('info', `Client ver : ${auth['octane-client-version']}`);
  log('info', `Work item  : ${config.workItemId}`);
  log('info', `Delay      : ${DELAY_MS}ms`);
  if (DRY_RUN) log('warn', 'DRY RUN    : no requests will be sent');
  console.log('');

  // ── Run ──────────────────────────────────────────────────────────────────────
  await runOctaneLinks({ testNames, config, session: auth, delayMs: DELAY_MS, dryRun: DRY_RUN });
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

function loadAuthFromCurl(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`ERROR  Curl file not found: ${resolved}`);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const auth = parseCurlCommand(raw);
    assertFields(auth, ['cookie', 'xsrf-header'], resolved);
    return auth;
  } catch (e) {
    console.error(`ERROR  Could not parse curl file ${filePath}: ${e.message}`);
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
