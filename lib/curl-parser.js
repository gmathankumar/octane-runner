'use strict';

/**
 * Parses a curl command (bash format) and extracts session headers.
 * Handles multi-line curl commands and quoted values.
 * 
 * @param {string} curlContent - The curl command as a string
 * @returns {{
 *   "request-url"?: string,
 *   cookie?: string,
 *   "xsrf-header"?: string,
 *   ptal?: string,
 *   "octane-client-version"?: string
 * }}
 */
function parseCurlCommand(curlContent) {
  const session = {};

  // Remove line continuations and newlines to get a single-line curl
  const normalized = curlContent
    .replace(/\\\n\s*/g, ' ')
    .replace(/\n\s*/g, ' ');

  // Extract URL from: curl 'https://...'
  const urlMatch = normalized.match(/^\s*curl\s+['"]([^'"]+)['"]/i);
  if (urlMatch) {
    session['request-url'] = urlMatch[1];
  }

  // Extract cookie from -b 'value' or -b "value"
  const cookieMatch = normalized.match(/-b\s+['"]([^'"]+)['"]/);
  if (cookieMatch) {
    session.cookie = cookieMatch[1];
  }

  // Extract headers from -H 'name: value' or -H "name: value"
  const headerRegex = /-H\s+['"]([^:]+):\s*([^'"]+)['"]/g;
  let match;

  while ((match = headerRegex.exec(normalized)) !== null) {
    const headerName = match[1].trim().toLowerCase();
    const headerValue = match[2].trim();

    if (headerName === 'xsrf-header') {
      session['xsrf-header'] = headerValue;
    } else if (headerName === 'ptal') {
      session.ptal = headerValue;
    } else if (headerName === 'octane-client-version') {
      session['octane-client-version'] = headerValue;
    }
  }

  return session;
}

module.exports = { parseCurlCommand };
