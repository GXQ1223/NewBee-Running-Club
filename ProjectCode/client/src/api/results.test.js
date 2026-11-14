import { api } from './client';
import { getMemberRaceResults } from './results';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
});

test('getMemberRaceResults GETs by search key without params by default', async () => {
  await expect(getMemberRaceResults('12345')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/results/member/12345', {});
});

test('getMemberRaceResults passes gender and birth_year params when provided', async () => {
  await getMemberRaceResults('12345', { gender: 'F', birth_year: 1990 });
  expect(api.get).toHaveBeenCalledWith('/api/results/member/12345', {
    gender: 'F',
    birth_year: 1990,
  });
});

test('getMemberRaceResults URL-encodes names with spaces', async () => {
  await getMemberRaceResults('Jane Doe');
  expect(api.get).toHaveBeenCalledWith('/api/results/member/Jane%20Doe', {});
});

test('getResultsDistribution GETs the distribution endpoint', async () => {
  const { getResultsDistribution } = require('./results');
  await expect(getResultsDistribution()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/results/distribution', {});
});
