import { api, ApiError, clearApiCache } from './client';

const BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

function makeResponse(data, { status = 200, contentType = 'application/json', json, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? contentType : null) },
    json: json || (() => Promise.resolve(data)),
    text: text || (() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
  };
}

beforeEach(() => {
  clearApiCache();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

describe('api.get', () => {
  test('builds URL without params, sends GET with JSON content type, parses JSON body', async () => {
    global.fetch.mockResolvedValue(makeResponse({ hello: 'world' }));

    const data = await api.get('/api/events');

    expect(data).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/events`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('appends query params to the URL', async () => {
    global.fetch.mockResolvedValue(makeResponse([]));

    await api.get('/api/events', { event_status: 'Upcoming', page: 2 });

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/api/events?event_status=Upcoming&page=2`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('merges custom headers with the default Content-Type', async () => {
    global.fetch.mockResolvedValue(makeResponse([]));

    await api.get('/api/banners/all', {}, { 'X-Firebase-UID': 'uid-1' });

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/banners/all`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-UID': 'uid-1' },
    });
  });

  test('custom headers can override the default Content-Type', async () => {
    global.fetch.mockResolvedValue(makeResponse('ok', { contentType: 'text/plain' }));

    await api.post('/api/raw', { a: 1 }, { 'Content-Type': 'text/csv' });

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/api/raw`,
      expect.objectContaining({ headers: { 'Content-Type': 'text/csv' } })
    );
  });

  test('returns text when response is not JSON', async () => {
    global.fetch.mockResolvedValue(makeResponse('plain text body', { contentType: 'text/plain' }));

    await expect(api.get('/api/text')).resolves.toBe('plain text body');
  });

  test('returns text when response has no content-type header', async () => {
    global.fetch.mockResolvedValue(makeResponse('empty', { contentType: null }));

    await expect(api.get('/api/no-ct')).resolves.toBe('empty');
  });
});

describe('response cache', () => {
  test('second GET for the same endpoint+params is served from cache', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    const first = await api.get('/api/events');
    const second = await api.get('/api/events');

    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('different query params use different cache entries', async () => {
    global.fetch
      .mockResolvedValueOnce(makeResponse({ page: 1 }))
      .mockResolvedValueOnce(makeResponse({ page: 2 }));

    await expect(api.get('/api/events', { page: 1 })).resolves.toEqual({ page: 1 });
    await expect(api.get('/api/events', { page: 2 })).resolves.toEqual({ page: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('skipCache bypasses the cache', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events');
    await api.get('/api/events', {}, {}, { skipCache: true });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('cache entry expires after the default 5 minute TTL', async () => {
    jest.useFakeTimers();
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events');
    jest.advanceTimersByTime(5 * 60 * 1000 - 1);
    await api.get('/api/events');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2); // now past TTL
    await api.get('/api/events');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('custom ttl option is honored', async () => {
    jest.useFakeTimers();
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events', {}, {}, { ttl: 1000 });
    jest.advanceTimersByTime(1500);
    await api.get('/api/events');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('POST invalidates cached GETs under the same resource prefix', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/donors');
    await api.get('/api/donors/individual');
    await api.post('/api/donors', { name: 'x' });
    await api.get('/api/donors');
    await api.get('/api/donors/individual');

    // 2 initial GETs + 1 POST + 2 refetched GETs
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  test('PUT invalidates cache for its resource prefix', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/donors');
    await api.put('/api/donors/5', { name: 'y' });
    await api.get('/api/donors');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('DELETE invalidates cache for its resource prefix', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/donors');
    await api.delete('/api/donors/5');
    await api.get('/api/donors');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('mutations do not invalidate unrelated resources', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/donors');
    await api.post('/api/credits', { a: 1 });
    await api.get('/api/donors'); // still cached

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('mutating /api/events also invalidates /api/banners (cross-resource dep)', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/banners');
    await api.post('/api/events/5/toggle', {});
    await api.get('/api/banners');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('mutating /api/gallery also invalidates /api/events (cross-resource dep)', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events');
    await api.delete('/api/gallery/9');
    await api.get('/api/events');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('short endpoints (fewer than 2 path parts) use the endpoint itself as prefix', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/health');
    await api.get('/api/events');
    await api.post('/health', {});
    await api.get('/health'); // invalidated -> refetch
    await api.get('/api/events'); // untouched -> cached

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('clearApiCache() with no args clears everything', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events');
    await api.get('/api/donors');
    clearApiCache();
    await api.get('/api/events');
    await api.get('/api/donors');

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  test('clearApiCache(prefix) clears only matching entries', async () => {
    global.fetch.mockResolvedValue(makeResponse({ n: 1 }));

    await api.get('/api/events');
    await api.get('/api/donors');
    clearApiCache('/api/donors');
    await api.get('/api/events'); // cached
    await api.get('/api/donors'); // refetched

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('failed GETs are not cached', async () => {
    global.fetch
      .mockResolvedValueOnce(makeResponse({ message: 'nope' }, { status: 500 }))
      .mockResolvedValueOnce(makeResponse({ n: 1 }));

    await expect(api.get('/api/events')).rejects.toThrow('nope');
    await expect(api.get('/api/events')).resolves.toEqual({ n: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('api.post / api.put / api.delete', () => {
  test('post sends JSON body with POST method and returns response data', async () => {
    global.fetch.mockResolvedValue(makeResponse({ id: 1 }));

    const result = await api.post('/api/donors', { name: 'A' }, { 'X-Firebase-UID': 'u1' });

    expect(result).toEqual({ id: 1 });
    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/donors`, {
      method: 'POST',
      body: JSON.stringify({ name: 'A' }),
      headers: { 'Content-Type': 'application/json', 'X-Firebase-UID': 'u1' },
    });
  });

  test('put sends JSON body with PUT method', async () => {
    global.fetch.mockResolvedValue(makeResponse({ id: 1 }));

    await api.put('/api/donors/1', { name: 'B' });

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/donors/1`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'B' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('delete sends DELETE method without a body', async () => {
    global.fetch.mockResolvedValue(makeResponse({ ok: true }));

    await api.delete('/api/donors/1', { 'X-Firebase-UID': 'u1' });

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/donors/1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-UID': 'u1' },
    });
    const options = global.fetch.mock.calls[0][1];
    expect(options.body).toBeUndefined();
  });
});

describe('error handling', () => {
  test('non-ok JSON response with message throws ApiError carrying status and data', async () => {
    const body = { message: 'Not found', code: 'E404' };
    global.fetch.mockResolvedValue(makeResponse(body, { status: 404 }));

    let caught;
    try {
      await api.get('/api/events/999');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.name).toBe('ApiError');
    expect(caught.message).toBe('Not found');
    expect(caught.status).toBe(404);
    expect(caught.data).toEqual(body);
  });

  test('non-ok JSON response without message falls back to status message', async () => {
    global.fetch.mockResolvedValue(makeResponse({ detail: 'oops' }, { status: 500 }));

    await expect(api.get('/api/events')).rejects.toThrow('Request failed with status 500');
  });

  test('non-ok non-JSON response falls back to status message with null data', async () => {
    global.fetch.mockResolvedValue(
      makeResponse(null, { status: 502, json: () => Promise.reject(new Error('bad json')) })
    );

    let caught;
    try {
      await api.post('/api/events', {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.message).toBe('Request failed with status 502');
    expect(caught.status).toBe(502);
    expect(caught.data).toBeNull();
  });

  test('network failure throws ApiError with status 0', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    let caught;
    try {
      await api.get('/api/events');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.message).toBe('Failed to fetch');
    expect(caught.status).toBe(0);
  });

  test('rejection without a message becomes "Network error"', async () => {
    global.fetch.mockRejectedValue({});

    await expect(api.delete('/api/events/1')).rejects.toThrow('Network error');
  });

  test('ApiError defaults data to null', () => {
    const err = new ApiError('boom', 418);
    expect(err.data).toBeNull();
    expect(err.status).toBe(418);
  });
});
