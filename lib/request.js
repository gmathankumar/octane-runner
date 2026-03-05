'use strict';

class HttpError extends Error {
  constructor(message, { status, headers, body }) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
    this.body = body;
  }
}

/**
 * Fires an HTTP/HTTPS request using native fetch (Node 18+).
 * @param {{
 *   url: string,
 *   method?: string,
 *   headers?: Record<string, string>,
 *   body?: string | null,
 *   timeoutMs?: number,
 *   throwOnHttpError?: boolean
 * }} opts
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
 */
async function doRequest({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = 30_000,
  throwOnHttpError = false,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    const plainHeaders = Object.fromEntries(res.headers.entries());

    const result = {
      status: res.status,
      headers: plainHeaders,
      body: text,
    };

    if (throwOnHttpError && !res.ok) {
      const snippet = text.length > 800 ? text.slice(0, 800) + '…' : text;
      throw new HttpError(`HTTP ${res.status} ${res.statusText} for ${method} ${url}\n${snippet}`, result);
    }

    return result;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${method} ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { doRequest, HttpError };
