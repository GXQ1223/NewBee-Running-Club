import * as apiIndex from './index';

test('re-exports the core client API and error class', () => {
  expect(typeof apiIndex.api.get).toBe('function');
  expect(typeof apiIndex.clearApiCache).toBe('function');
  expect(new apiIndex.ApiError('x', 1)).toBeInstanceOf(Error);
});

test('re-exports functions from every domain module', () => {
  const expected = [
    // meetings + records
    'getMeetingFiles', 'getMeetingContent', 'getAvailableYears', 'getMenRecords',
    'getWomenRecords', 'getAllRaces',
    // members
    'syncFirebaseUser', 'getMemberByFirebaseUid', 'getMember', 'updateMember',
    'updateMemberPrivacy', 'getMembersForCredits', 'getCommitteeMembers',
    // events
    'getAllEvents', 'getEventsByStatus', 'getEventById', 'createEvent', 'updateEvent',
    'deleteEvent', 'getEventSeries', 'addEventToSeries', 'toggleSeriesParent',
    'dissolveSeries', 'removeEventFromSeries', 'mergeEventsToGroup', 'removeEventFromGroup',
    'getHighlightsGrouped', 'updateGroupName', 'undoGroupMerge',
    // meeting minutes
    'getAllMeetingMinutes', 'getMeetingMinutesById', 'createMeetingMinutes',
    'updateMeetingMinutes', 'deleteMeetingMinutes',
    // engagement
    'getAnonymousId', 'getEventComments', 'getAllEventComments', 'createComment',
    'deleteComment', 'toggleCommentHighlight', 'hideComment', 'unhideComment',
    'getEventLikes', 'toggleLike', 'removeLike', 'getEventReactions', 'toggleReaction',
    'removeReaction', 'getEventEngagement', 'getBatchEngagement', 'getEventSettings',
    'updateEventSettings',
    // gallery
    'getEventGallery', 'getEventGalleryPreview', 'getBatchGalleryPreview',
    'uploadGalleryImage', 'updateGalleryImage', 'deleteGalleryImage',
    'toggleGalleryImageLike', 'compressImage', 'downloadImage', 'shareImage',
    // settings
    'getSocialLinks', 'getAllSettings', 'getSettingsByCategory', 'updateSetting',
    'createSetting',
  ];
  for (const name of expected) {
    expect(typeof apiIndex[name]).toBe('function');
  }
  expect(Array.isArray(apiIndex.ALLOWED_EMOJIS)).toBe(true);
});
