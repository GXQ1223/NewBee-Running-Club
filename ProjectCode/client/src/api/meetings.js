// Note: Meeting minutes are now stored in the database.
// Legacy file-based functions have been removed.

/**
 * @deprecated Meeting files are no longer used. Use meetingMinutes API instead.
 * @returns {Array} Empty array for backwards compatibility
 */
export const getMeetingFiles = () => {
  return [];
};

/**
 * @deprecated Meeting content is now fetched from the database.
 * Use getMeetingMinutesById from meetingMinutes.js instead.
 */
export const getMeetingContent = async () => {
  console.warn('getMeetingContent is deprecated. Use getMeetingMinutesById instead.');
  return '';
}; 