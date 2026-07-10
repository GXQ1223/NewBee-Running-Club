import { api } from './client';
import {
  getAvailableYears,
  getMenRecords,
  getWomenRecords,
  getAllRaces,
  getSyncRacePatterns,
  startNyrrSync,
} from './records';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// jsdom does not provide TextEncoder/TextDecoder; startNyrrSync needs TextDecoder.
const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('util');
global.TextEncoder = global.TextEncoder || NodeTextEncoder;
global.TextDecoder = global.TextDecoder || NodeTextDecoder;

const BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
const UID = 'admin-uid';

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
});

afterEach(() => {
  delete global.fetch;
});

test('getAvailableYears GETs available years', async () => {
  await expect(getAvailableYears()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/results/available-years');
});

test('getMenRecords GETs without params by default and with year filter', async () => {
  await getMenRecords();
  expect(api.get).toHaveBeenCalledWith('/api/results/men-records', {});
  await getMenRecords(2025);
  expect(api.get).toHaveBeenCalledWith('/api/results/men-records', { year: 2025 });
});

test('getWomenRecords GETs without params by default and with year filter', async () => {
  await getWomenRecords();
  expect(api.get).toHaveBeenCalledWith('/api/results/women-records', {});
  await getWomenRecords(2024);
  expect(api.get).toHaveBeenCalledWith('/api/results/women-records', { year: 2024 });
});

test('getAllRaces GETs all race names', async () => {
  await getAllRaces();
  expect(api.get).toHaveBeenCalledWith('/api/results/all-races');
});

test('getSyncRacePatterns GETs the sync race list', async () => {
  await getSyncRacePatterns();
  expect(api.get).toHaveBeenCalledWith('/api/results/sync/races');
});

describe('startNyrrSync', () => {
  function sseResponse(chunks) {
    const encoder = new NodeTextEncoder();
    let i = 0;
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: () =>
            Promise.resolve(
              i < chunks.length
                ? { done: false, value: encoder.encode(chunks[i++]) }
                : { done: true, value: undefined }
            ),
        }),
      },
    };
  }

  test('POSTs sync params and forwards parsed SSE events to onProgress', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"step":1}\ndata: {"st', 'ep":2}\n', 'data: {"step":3}\n'])
    );
    const onProgress = jest.fn();
    const params = { years: [2026], race_codes: ['B2026'] };

    await startNyrrSync(params, UID, onProgress);

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/api/results/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-UID': UID },
      body: JSON.stringify(params),
    });
    expect(onProgress.mock.calls.map(([e]) => e)).toEqual([
      { step: 1 },
      { step: 2 },
      { step: 3 },
    ]);
  });

  test('skips malformed and non-data SSE lines', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([': keepalive\n\ndata: not-json\ndata: {"ok":true}\n'])
    );
    const onProgress = jest.fn();

    await startNyrrSync({ years: [] }, UID, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ ok: true });
  });

  test('throws the server detail message when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'admin only' }),
    });

    await expect(startNyrrSync({ years: [] }, UID, jest.fn())).rejects.toThrow('admin only');
  });

  test('falls back to a status message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(startNyrrSync({ years: [] }, UID, jest.fn())).rejects.toThrow(
      'Sync failed with status 500'
    );
  });
});
