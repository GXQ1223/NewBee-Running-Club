import { api } from './client';
import {
  getAllMeetingMinutes,
  getMeetingMinutesById,
  createMeetingMinutes,
  updateMeetingMinutes,
  deleteMeetingMinutes,
} from './meetingMinutes';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'admin-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('getAllMeetingMinutes GETs all minutes', async () => {
  await expect(getAllMeetingMinutes()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/meeting-minutes');
});

test('getMeetingMinutesById GETs a single minutes record', async () => {
  await getMeetingMinutesById(12);
  expect(api.get).toHaveBeenCalledWith('/api/meeting-minutes/12');
});

test('createMeetingMinutes POSTs minutes data with UID header', async () => {
  const data = { title: 'July', meeting_date: '2026-07-01', content: 'hi' };
  await expect(createMeetingMinutes(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/meeting-minutes', data, AUTH);
});

test('updateMeetingMinutes PUTs minutes data with UID header', async () => {
  const data = { title: 'July (rev)' };
  await expect(updateMeetingMinutes(12, data, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/meeting-minutes/12', data, AUTH);
});

test('deleteMeetingMinutes DELETEs the minutes with UID header', async () => {
  await expect(deleteMeetingMinutes(12, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/meeting-minutes/12', AUTH);
});
