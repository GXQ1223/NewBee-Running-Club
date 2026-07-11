import { api } from './client';
import {
  getAllEvents,
  getEventsByStatus,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventWithRecurrence,
  createEventRecurrence,
  updateEventRecurrence,
  deleteEventRecurrence,
  getEventSeries,
  addEventToSeries,
  toggleSeriesParent,
  dissolveSeries,
  removeEventFromSeries,
  mergeEventsToGroup,
  removeEventFromGroup,
  getHighlightsGrouped,
  updateGroupName,
  undoGroupMerge,
} from './events';

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

test('getAllEvents GETs events without params by default', async () => {
  await expect(getAllEvents()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/events', {});
});

test('getAllEvents passes event_status when given', async () => {
  await getAllEvents('Upcoming');
  expect(api.get).toHaveBeenCalledWith('/api/events', { event_status: 'Upcoming' });
});

test('getEventsByStatus GETs the status endpoint', async () => {
  await getEventsByStatus('Past');
  expect(api.get).toHaveBeenCalledWith('/api/events/status/Past');
});

test('getEventById GETs a single event', async () => {
  await getEventById(3);
  expect(api.get).toHaveBeenCalledWith('/api/events/3');
});

test('createEvent POSTs event data with UID header', async () => {
  const data = { name: 'Track Night' };
  await expect(createEvent(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/events', data, AUTH);
});

test('updateEvent PUTs event data with UID header', async () => {
  const data = { name: 'Track Night 2' };
  await expect(updateEvent(3, data, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/events/3', data, AUTH);
});

test('deleteEvent DELETEs the event with UID header', async () => {
  await expect(deleteEvent(3, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/events/3', AUTH);
});

test('getEventWithRecurrence GETs the event with its rule, skipping the cache', async () => {
  await expect(getEventWithRecurrence(3)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/events/3/with-recurrence', {}, {}, { skipCache: true });
});

test('createEventRecurrence POSTs the rule with UID header', async () => {
  const rule = { recurrence_type: 'yearly' };
  await expect(createEventRecurrence(3, rule, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/events/3/recurrence', rule, AUTH);
});

test('updateEventRecurrence PUTs the rule with UID header', async () => {
  const rule = { end_date: '2027-12-31' };
  await expect(updateEventRecurrence(3, rule, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/events/3/recurrence', rule, AUTH);
});

test('deleteEventRecurrence DELETEs the rule with UID header', async () => {
  await expect(deleteEventRecurrence(3, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/events/3/recurrence', AUTH);
});

test('getEventSeries GETs the series for an event', async () => {
  await getEventSeries(3);
  expect(api.get).toHaveBeenCalledWith('/api/events/3/series');
});

test('addEventToSeries POSTs with both event and parent ids', async () => {
  await addEventToSeries(3, 8, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/3/add-to-series/8', {}, AUTH);
});

test('toggleSeriesParent POSTs the toggle endpoint', async () => {
  await toggleSeriesParent(3, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/3/toggle-series-parent', {}, AUTH);
});

test('dissolveSeries POSTs the dissolve endpoint', async () => {
  await dissolveSeries(3, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/3/dissolve-series', {}, AUTH);
});

test('removeEventFromSeries POSTs the remove endpoint', async () => {
  await removeEventFromSeries(3, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/3/remove-from-series', {}, AUTH);
});

test('mergeEventsToGroup POSTs both event ids', async () => {
  await mergeEventsToGroup(3, 8, UID);
  expect(api.post).toHaveBeenCalledWith(
    '/api/events/groups/merge',
    { event_a_id: 3, event_b_id: 8 },
    AUTH
  );
});

test('removeEventFromGroup POSTs the remove-from-group endpoint', async () => {
  await removeEventFromGroup(3, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/3/remove-from-group', {}, AUTH);
});

test('getHighlightsGrouped GETs grouped highlights', async () => {
  await getHighlightsGrouped();
  expect(api.get).toHaveBeenCalledWith('/api/events/highlights/grouped');
});

test('updateGroupName PUTs both language names', async () => {
  await updateGroupName(8, 'Summer Series', '夏季系列', UID);
  expect(api.put).toHaveBeenCalledWith(
    '/api/events/groups/8/name',
    { group_name: 'Summer Series', group_name_cn: '夏季系列' },
    AUTH
  );
});

test('undoGroupMerge POSTs with event_id query param', async () => {
  await undoGroupMerge(8, 3, UID);
  expect(api.post).toHaveBeenCalledWith('/api/events/groups/8/undo-merge?event_id=3', {}, AUTH);
});
