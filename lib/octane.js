'use strict';

const { randomUUID } = require('crypto');
const { doRequest }  = require('./request');

/**
 * Main loop: for each test name, search Octane then PUT the work item link.
 *
 * @param {{
 *   testNames : string[],
 *   config    : { searchUrl: string, updateUrl: string, workItemId: string },
 *   session   : { cookie: string, 'xsrf-header': string, ptal?: string },
 *   delayMs   : number,
 *   dryRun    : boolean
 * }} opts
 */
async function runOctaneLinks({ testNames, config, session, delayMs, dryRun }) {
  const results = { found: 0, skipped: 0, updated: 0, failed: 0 };
  const notFound = [];

  // Headers common to every request — session values injected here
  const baseHeaders = {
    'accept':                 'application/json, text/plain, */*',
    'accept-language':        'en-US,en;q=0.9',
    'hpeclienttype':          'HPE_MQM_UI',
    'octane-client-version':  '26.2.8.91',
    'userlanguage':           'english',
    'timezoneoffset':         '0',
    'space-metadata-version': '-1',
    'user-agent':             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Cookie':                 session['cookie'],
    'xsrf-header':            session['xsrf-header'],
    ...(session['ptal'] ? { 'ptal': session['ptal'] } : {}),
  };

  for (let i = 0; i < testNames.length; i++) {
    const testName = testNames[i];
    const prefix   = `[${i + 1}/${testNames.length}]`;

    process.stdout.write(`${prefix} Searching: "${testName}" ... `);

    // ── 1. GET search ──────────────────────────────────────────────────────────
    const searchReq = {
      url:    buildSearchUrl(config.searchUrl, testName),
      method: 'GET',
      headers: { ...baseHeaders, 'x-correlation-id': randomUUID() },
      body:   null,
    };

    let testId;
    if (!dryRun) {
      try {
        const res = await doRequest(searchReq);

        if (res.status === 401) {
          console.log('');
          log('error', '401 Unauthorized — session has expired. Update session.json and retry.');
          printSummary(results, notFound);
          process.exit(1);
        }

        let json;
        try {
          json = JSON.parse(res.body);
        } catch {
          console.log(`\x1b[31mPARSE ERROR\x1b[0m — unexpected response: ${res.body.slice(0, 100)}`);
          results.failed++;
          continue;
        }

        if (!json.total_count || !json.data?.length) {
          console.log('\x1b[33mNOT FOUND\x1b[0m — skipping');
          notFound.push(testName);
          results.skipped++;
          continue;
        }

        testId = json.data[0].id;
        console.log(`\x1b[32mfound\x1b[0m id=${testId}`);
        results.found++;
      } catch (err) {
        console.log(`\x1b[31mSEARCH ERROR\x1b[0m — ${err.message}`);
        results.failed++;
        continue;
      }
    } else {
      testId = 'DRY_RUN_ID';
      console.log('(dry-run)');
      results.found++;
    }

    // ── 2. PUT update ──────────────────────────────────────────────────────────
    const putBody = buildPutBody(testId, config.workItemId);
    const putReq  = {
      url:    config.updateUrl,
      method: 'PUT',
      headers: {
        ...baseHeaders,
        'x-correlation-id': randomUUID(),
        'content-type':     'application/json;charset=UTF-8',
        'origin':           new URL(config.updateUrl).origin,
      },
      body: putBody,
    };

    process.stdout.write(`${' '.repeat(prefix.length)} Updating  id=${testId} ... `);

    if (!dryRun) {
      try {
        const putRes = await doRequest(putReq);
        const ok     = putRes.status >= 200 && putRes.status < 300;
        if (ok) {
          console.log(`\x1b[32m${putRes.status} OK\x1b[0m`);
          results.updated++;
        } else {
          const preview = putRes.body.slice(0, 200).replace(/\n/g, ' ');
          console.log(`\x1b[31m${putRes.status} FAIL\x1b[0m — ${preview}`);
          results.failed++;
        }
      } catch (err) {
        console.log(`\x1b[31mPUT ERROR\x1b[0m — ${err.message}`);
        results.failed++;
      }
    } else {
      console.log(`(dry-run) body=${putBody}`);
      results.updated++;
    }

    if (delayMs > 0 && i < testNames.length - 1) await sleep(delayMs);
  }

  printSummary(results, notFound);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSearchUrl(baseUrl, testName) {
  const u = new URL(baseUrl);
  u.searchParams.set('text_search', JSON.stringify({ type: 'context', text: testName }));
  return u.toString();
}

function buildPutBody(testId, workItemId) {
  return JSON.stringify({
    data: [{
      covered_content: {
        data: [{ type: 'work_item', id: workItemId, op_code: 'add' }]
      },
      id: String(testId),
    }],
  });
}

function printSummary(results, notFound) {
  console.log('');
  log('info', `Done — found: ${results.found}, updated: ${results.updated}, skipped: ${results.skipped}, failed: ${results.failed}`);

  if (notFound.length > 0) {
    log('warn', `${notFound.length} test(s) not found in Octane:`);
    notFound.forEach(n => log('warn', `  · ${n}`));
  }
}

function log(level, msg) {
  const p = { info: '\x1b[36mINFO\x1b[0m', warn: '\x1b[33mWARN\x1b[0m', error: '\x1b[31mERROR\x1b[0m' };
  console.log(`${p[level] || level}  ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runOctaneLinks };
