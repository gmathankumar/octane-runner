'use strict';

jest.mock('../lib/request', () => ({
  doRequest: jest.fn(),
}));

const { doRequest } = require('../lib/request');
const { runOctaneLinks } = require('../lib/octane');

describe('runOctaneLinks', () => {
  let logSpy;
  let writeSpy;

  beforeEach(() => {
    doRequest.mockReset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  test('does not call network in dry-run mode', async () => {
    await runOctaneLinks({
      testNames: ['test_alpha'],
      config: {
        searchUrl: 'https://example.com/tests?fields=id',
        updateUrl: 'https://example.com/tests',
        workItemId: '1809072',
      },
      session: {
        cookie: 'cookie-value',
        'xsrf-header': 'xsrf-value',
      },
      delayMs: 0,
      dryRun: true,
    });

    expect(doRequest).not.toHaveBeenCalled();
  });

  test('searches then updates when test is found', async () => {
    doRequest
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ total_count: 1, data: [{ id: 123 }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        body: '{"ok":true}',
      });

    await runOctaneLinks({
      testNames: ['test_alpha'],
      config: {
        searchUrl: 'https://example.com/tests?fields=id',
        updateUrl: 'https://example.com/tests',
        workItemId: '1809072',
      },
      session: {
        cookie: 'cookie-value',
        'xsrf-header': 'xsrf-value',
      },
      delayMs: 0,
      dryRun: false,
    });

    expect(doRequest).toHaveBeenCalledTimes(2);

    const getCall = doRequest.mock.calls[0][0];
    const putCall = doRequest.mock.calls[1][0];

    expect(getCall.method).toBe('GET');
    expect(new URL(getCall.url).searchParams.get('text_search')).toContain('test_alpha');

    expect(putCall.method).toBe('PUT');
    const body = JSON.parse(putCall.body);
    expect(body.data[0].id).toBe('123');
    expect(body.data[0].covered_content.data[0].id).toBe('1809072');
  });

  test('skips update when search does not return any match', async () => {
    doRequest.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ total_count: 0, data: [] }),
    });

    await runOctaneLinks({
      testNames: ['test_missing'],
      config: {
        searchUrl: 'https://example.com/tests?fields=id',
        updateUrl: 'https://example.com/tests',
        workItemId: '1809072',
      },
      session: {
        cookie: 'cookie-value',
        'xsrf-header': 'xsrf-value',
      },
      delayMs: 0,
      dryRun: false,
    });

    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(doRequest.mock.calls[0][0].method).toBe('GET');
  });
});
