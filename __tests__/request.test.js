'use strict';

const { doRequest, HttpError } = require('../lib/request');

describe('doRequest', () => {
  afterEach(() => {
    delete global.fetch;
    jest.useRealTimers();
  });

  test('returns status, headers, and body for successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: { entries: () => [['content-type', 'application/json']] },
      text: async () => '{"ok":true}',
    });

    const result = await doRequest({
      url: 'https://example.com/tests',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });

    expect(result).toEqual({
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
  });

  test('throws HttpError when throwOnHttpError is true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { entries: () => [['content-type', 'text/plain']] },
      text: async () => 'boom',
    });

    await expect(doRequest({
      url: 'https://example.com/tests',
      method: 'PUT',
      throwOnHttpError: true,
    })).rejects.toBeInstanceOf(HttpError);
  });

  test('throws timeout error when request takes too long', async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn().mockImplementation((_url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const promise = doRequest({
      url: 'https://example.com/slow',
      timeoutMs: 50,
    });

    const assertion = expect(promise).rejects.toThrow('Request timed out after 50ms: GET https://example.com/slow');
    await jest.advanceTimersByTimeAsync(60);
    await assertion;
  });
});
