'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractTestNames } = require('../lib/patch');

function writeTempPatch(contents) {
  const file = path.join(os.tmpdir(), `octane-runner-test-${Date.now()}-${Math.random()}.patch`);
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

describe('extractTestNames', () => {
  test('extracts, sorts, and deduplicates test names using default regex', () => {
    const patch = [
      '+ public void test_beta() {',
      '+ public void test_alpha() {',
      '+ public void test_beta() {',
      '- public void test_removed() {',
    ].join('\n');

    const file = writeTempPatch(patch);
    try {
      expect(extractTestNames(file)).toEqual(['test_alpha', 'test_beta']);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('supports custom regex pattern', () => {
    const patch = [
      '+ it("test_name_one", () => {})',
      '+ it("test_name_two", () => {})',
    ].join('\n');

    const file = writeTempPatch(patch);
    try {
      const pattern = '^\\+.*it\\("(test_name_[a-z]+)"';
      expect(extractTestNames(file, pattern)).toEqual(['test_name_one', 'test_name_two']);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('throws a clear error when regex pattern is invalid', () => {
    const file = writeTempPatch('+ public void test_alpha() {}');
    try {
      expect(() => extractTestNames(file, '[invalid')).toThrow('Invalid testNameRegex pattern in config');
    } finally {
      fs.unlinkSync(file);
    }
  });
});
