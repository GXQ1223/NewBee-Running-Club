import { api } from './client';
import {
  ALLOWED_EMOJIS,
  getAnonymousId,
  getEventComments,
  getAllEventComments,
  createComment,
  deleteComment,
  toggleCommentHighlight,
  hideComment,
  unhideComment,
  getEventLikes,
  toggleLike,
  removeLike,
  getEventReactions,
  toggleReaction,
  removeReaction,
  getEventEngagement,
  getBatchEngagement,
  getEventSettings,
  updateEventSettings,
} from './engagement';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'user-uid';
const AUTH = { 'X-Firebase-UID': UID };
const ANON = 'anon_fixed_id';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('newbee_anonymous_id', ANON);
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

describe('getAnonymousId', () => {
  test('returns the stored anonymous id when present', () => {
    expect(getAnonymousId()).toBe(ANON);
  });

  test('generates and persists a new id when missing', () => {
    localStorage.clear();
    const id = getAnonymousId();
    expect(id).toMatch(/^anon_\d+_[a-z0-9]+$/);
    expect(localStorage.getItem('newbee_anonymous_id')).toBe(id);
    // Subsequent calls are stable
    expect(getAnonymousId()).toBe(id);
  });
});

test('ALLOWED_EMOJIS exposes the 8 reaction emojis', () => {
  expect(ALLOWED_EMOJIS).toHaveLength(8);
  expect(ALLOWED_EMOJIS).toContain('🐝');
});

describe('comments', () => {
  test('getEventComments GETs visible comments', async () => {
    await expect(getEventComments(7)).resolves.toBe('GET');
    expect(api.get).toHaveBeenCalledWith('/api/events/7/comments');
  });

  test('getAllEventComments GETs all comments with admin header', async () => {
    await getAllEventComments(7, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/comments/all', {}, AUTH);
  });

  test('createComment POSTs content with user header', async () => {
    await createComment(7, 'Nice run!', UID);
    expect(api.post).toHaveBeenCalledWith('/api/events/7/comments', { content: 'Nice run!' }, AUTH);
  });

  test('deleteComment DELETEs with user header', async () => {
    await deleteComment(11, UID);
    expect(api.delete).toHaveBeenCalledWith('/api/comments/11', AUTH);
  });

  test('toggleCommentHighlight PUTs the highlight endpoint', async () => {
    await toggleCommentHighlight(11, UID);
    expect(api.put).toHaveBeenCalledWith('/api/comments/11/highlight', {}, AUTH);
  });

  test('hideComment PUTs the reason', async () => {
    await hideComment(11, 'spam', UID);
    expect(api.put).toHaveBeenCalledWith('/api/comments/11/hide', { reason: 'spam' }, AUTH);
  });

  test('unhideComment PUTs the unhide endpoint', async () => {
    await unhideComment(11, UID);
    expect(api.put).toHaveBeenCalledWith('/api/comments/11/unhide', {}, AUTH);
  });
});

describe('likes', () => {
  test('getEventLikes uses UID header when logged in', async () => {
    await getEventLikes(7, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/likes', {}, AUTH);
  });

  test('getEventLikes falls back to anonymous_id param when logged out', async () => {
    await getEventLikes(7);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/likes', { anonymous_id: ANON }, {});
  });

  test('toggleLike POSTs empty body with UID header when logged in', async () => {
    await toggleLike(7, UID);
    expect(api.post).toHaveBeenCalledWith('/api/events/7/likes', {}, AUTH);
  });

  test('toggleLike POSTs anonymous_id body when logged out', async () => {
    await toggleLike(7);
    expect(api.post).toHaveBeenCalledWith('/api/events/7/likes', { anonymous_id: ANON }, {});
  });

  test('removeLike DELETEs with anonymous_id query when logged out', async () => {
    await removeLike(7);
    expect(api.delete).toHaveBeenCalledWith(`/api/events/7/likes?anonymous_id=${ANON}`, {});
  });

  test('removeLike DELETEs with UID header when logged in', async () => {
    await removeLike(7, UID);
    expect(api.delete).toHaveBeenCalledWith('/api/events/7/likes?', AUTH);
  });
});

describe('reactions', () => {
  test('getEventReactions handles logged-in and anonymous users', async () => {
    await getEventReactions(7, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/reactions', {}, AUTH);

    await getEventReactions(7);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/reactions', { anonymous_id: ANON }, {});
  });

  test('toggleReaction POSTs emoji with UID header when logged in', async () => {
    await toggleReaction(7, '🔥', UID);
    expect(api.post).toHaveBeenCalledWith('/api/events/7/reactions', { emoji: '🔥' }, AUTH);
  });

  test('toggleReaction includes anonymous_id in body when logged out', async () => {
    await toggleReaction(7, '🔥');
    expect(api.post).toHaveBeenCalledWith(
      '/api/events/7/reactions',
      { emoji: '🔥', anonymous_id: ANON },
      {}
    );
  });

  test('removeReaction encodes the emoji and appends anonymous query', async () => {
    await removeReaction(7, '🐝');
    expect(api.delete).toHaveBeenCalledWith(
      `/api/events/7/reactions/${encodeURIComponent('🐝')}?anonymous_id=${ANON}`,
      {}
    );
  });

  test('removeReaction uses UID header when logged in', async () => {
    await removeReaction(7, '🐝', UID);
    expect(api.delete).toHaveBeenCalledWith(
      `/api/events/7/reactions/${encodeURIComponent('🐝')}?`,
      AUTH
    );
  });
});

describe('aggregated engagement', () => {
  test('getEventEngagement handles logged-in and anonymous users', async () => {
    await getEventEngagement(7, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/engagement', {}, AUTH);

    await getEventEngagement(7);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/engagement', { anonymous_id: ANON }, {});
  });

  test('getBatchEngagement POSTs event ids, adding anonymous_id when logged out', async () => {
    await getBatchEngagement([1, 2], UID);
    expect(api.post).toHaveBeenCalledWith('/api/events/engagement/batch', { event_ids: [1, 2] }, AUTH);

    await getBatchEngagement([1, 2]);
    expect(api.post).toHaveBeenCalledWith(
      '/api/events/engagement/batch',
      { event_ids: [1, 2], anonymous_id: ANON },
      {}
    );
  });
});

describe('event settings', () => {
  test('getEventSettings GETs settings', async () => {
    await getEventSettings(7);
    expect(api.get).toHaveBeenCalledWith('/api/events/7/settings');
  });

  test('updateEventSettings PUTs settings with admin header', async () => {
    await updateEventSettings(7, { comments_enabled: false }, UID);
    expect(api.put).toHaveBeenCalledWith(
      '/api/events/7/settings',
      { comments_enabled: false },
      AUTH
    );
  });
});
