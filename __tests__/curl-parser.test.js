const { parseCurlCommand } = require('../lib/curl-parser');

describe('curl-parser', () => {
  test('parses single-line curl with multi-line headers', () => {
    const curl = `curl 'https://example.com/api/test' \\
  -H 'xsrf-header: 2clac8bbf0nj9remp26itlddcm' \\
  -b 'LWSSO_COOKIE=abc123def456' \\
  -H 'ptal: 98a73bcfae1cf3d57ba6e0079d62a396'`;

    const result = parseCurlCommand(curl);
    
    expect(result['request-url']).toBe('https://example.com/api/test');
    expect(result.cookie).toBe('LWSSO_COOKIE=abc123def456');
    expect(result['xsrf-header']).toBe('2clac8bbf0nj9remp26itlddcm');
    expect(result.ptal).toBe('98a73bcfae1cf3d57ba6e0079d62a396');
  });

  test('parses curl with complex cookie string', () => {
    const curl = `curl 'https://example.com/api' -b 'cookie1=value1; cookie2=value2; LWSSO_COOKIE_KEY=verylongtoken123' -H 'xsrf-header: token'`;
    
    const result = parseCurlCommand(curl);
    
    expect(result.cookie).toContain('LWSSO_COOKIE_KEY=verylongtoken123');
    expect(result['xsrf-header']).toBe('token');
  });

  test('parses curl with double quotes', () => {
    const curl = `curl "https://example.com/api" -b "SESSION=xyz" -H "xsrf-header: abc123"`;
    
    const result = parseCurlCommand(curl);
    
    expect(result.cookie).toBe('SESSION=xyz');
    expect(result['xsrf-header']).toBe('abc123');
  });

  test('handles missing optional ptal field', () => {
    const curl = `curl 'https://example.com/api' -b 'cookie=value' -H 'xsrf-header: token'`;
    
    const result = parseCurlCommand(curl);
    
    expect(result.cookie).toBe('cookie=value');
    expect(result['xsrf-header']).toBe('token');
    expect(result.ptal).toBeUndefined();
  });

  test('extracts headers case-insensitively', () => {
    const curl = `curl 'https://example.com/api' -b 'cookie=value' -H 'XSRF-HEADER: token' -H 'PTAL: abc' -H 'OCTANE-CLIENT-VERSION: 26.2.16.64'`;
    
    const result = parseCurlCommand(curl);
    
    expect(result['xsrf-header']).toBe('token');
    expect(result.ptal).toBe('abc');
    expect(result['octane-client-version']).toBe('26.2.16.64');
  });
});
