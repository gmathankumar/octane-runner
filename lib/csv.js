'use strict';

/**
 * Parse a CSV string into an array of objects keyed by the header row.
 * Handles quoted fields and escaped double-quotes.
 */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row');

  const headers = splitLine(lines[0]);
  return lines
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = splitLine(line);
      return Object.fromEntries(headers.map((h, i) => [h.trim(), (vals[i] ?? '').trim()]));
    });
}

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

module.exports = { parseCSV };
