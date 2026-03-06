'use strict';

const { parseCSV } = require('../lib/csv');

describe('parseCSV', () => {
  test('parses header/value rows into objects', () => {
    const csv = 'testName,status\n test_one , pass ';

    const rows = parseCSV(csv);

    expect(rows).toEqual([{ testName: 'test_one', status: 'pass' }]);
  });

  test('handles quoted commas and escaped quotes', () => {
    const csv = 'testName,notes\n"test_alpha","value with , comma and ""quote"""';

    const rows = parseCSV(csv);

    expect(rows).toEqual([
      { testName: 'test_alpha', notes: 'value with , comma and "quote"' },
    ]);
  });

  test('throws when CSV does not contain header and data rows', () => {
    expect(() => parseCSV('only_header')).toThrow('CSV needs a header row and at least one data row');
  });
});
