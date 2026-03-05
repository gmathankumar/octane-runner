'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

/**
 * Runs `git show <hash> --patch` in CWD, writes output to a temp file,
 * extracts all test_* function names added in the diff, then cleans up.
 *
 * @param {string} commitHash  - short or full git commit hash
 * @returns {string[]}         - sorted, deduplicated array of test names
 */
async function extractTestNamesFromCommit(commitHash) {
  const tmpFile = path.join(os.tmpdir(), `octane-runner-${commitHash}-${Date.now()}.patch`);

  try {
    // Validate the hash exists before doing anything
    const check = spawnSync('git', ['cat-file', '-t', commitHash], {
      cwd:      process.cwd(),
      encoding: 'utf8',
    });

    if (check.status !== 0) {
      throw new Error(
        `git commit "${commitHash}" not found in this repository.\n` +
        `Make sure you're running octane-runner from inside the repo.`
      );
    }

    console.log(`\x1b[36mINFO\x1b[0m  Running: git show ${commitHash} --patch`);
    console.log(`\x1b[36mINFO\x1b[0m  Writing patch to temp file: ${tmpFile}`);

    // Stream patch to temp file — avoids holding potentially large diffs in memory
    const result = spawnSync(
      'git',
      ['show', commitHash, '--patch', '--no-color'],
      {
        cwd:      process.cwd(),
        encoding: 'buffer',
        maxBuffer: 200 * 1024 * 1024, // 200 MB — generous for large commits
      }
    );

    if (result.status !== 0) {
      const stderr = result.stderr?.toString('utf8') || '';
      throw new Error(`git show failed: ${stderr}`);
    }

    fs.writeFileSync(tmpFile, result.stdout);

    const patchSize = (result.stdout.length / 1024).toFixed(1);
    console.log(`\x1b[36mINFO\x1b[0m  Patch size: ${patchSize} KB`);

    return extractTestNames(tmpFile);

  } finally {
    // Always clean up the temp file
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
      console.log(`\x1b[36mINFO\x1b[0m  Temp patch file removed`);
    }
  }
}

/**
 * Reads patch file and extracts test_* names from added lines only (+).
 * Matches patterns like: `test_validateLastName_surnameProvided_returnsSuccess(`
 */
function extractTestNames(patchFilePath) {
  const patch = fs.readFileSync(patchFilePath, 'utf8');
  const regex = /^\+.*\b(test_[a-zA-Z0-9_]+)\s*\(/gm;
  const tests = new Set();
  let match;

  while ((match = regex.exec(patch)) !== null) {
    tests.add(match[1]);
  }

  return [...tests].sort();
}

module.exports = { extractTestNamesFromCommit, extractTestNames };
