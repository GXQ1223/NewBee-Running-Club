/**
 * Events API client
 * Handles all event-related API calls
 */

import { api } from './client';

/**
 * Get all events
 * @param {string} status - Optional status filter (Upcoming, Highlight, Cancelled)
 * @returns {Promise<Array>} - List of events
 */
export const getAllEvents = async (status = null) => {
  const params = status ? { event_status: status } : {};
  return api.get('/api/events', params);
};

/**
 * Get events by status
 * @param {string} status - Event status (Upcoming, Highlight, Cancelled)
 * @returns {Promise<Array>} - List of events with the specified status
 */
export const getEventsByStatus = async (status) => {
  return api.get(`/api/events/status/${status}`);
};

/**
 * Get a single event by ID
 * @param {number} eventId - Event ID
 * @returns {Promise<Object>} - Event data
 */
export const getEventById = async (eventId) => {
  return api.get(`/api/events/${eventId}`);
};

/**
 * Create a new event (admin only)
 * @param {Object} eventData - Event data
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Created event
 */
export const createEvent = async (eventData, firebaseUid) => {
  return api.post('/api/events', eventData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Update an existing event (admin only)
 * @param {number} eventId - Event ID
 * @param {Object} eventData - Updated event data
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Updated event
 */
export const updateEvent = async (eventId, eventData, firebaseUid) => {
  return api.put(`/api/events/${eventId}`, eventData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete an event (admin only)
 * @param {number} eventId - Event ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteEvent = async (eventId, firebaseUid) => {
  return api.delete(`/api/events/${eventId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Get all events in a recurring series
 * @param {number} eventId - Event ID (can be parent or child)
 * @returns {Promise<Array>} - List of events in the series
 */
export const getEventSeries = async (eventId) => {
  return api.get(`/api/events/${eventId}/series`);
};

/**
 * Add an existing event to a recurring series (admin only)
 * @param {number} eventId - Event ID to add
 * @param {number} parentId - Parent event ID (series)
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Success message
 */
export const addEventToSeries = async (eventId, parentId, firebaseUid) => {
  return api.post(`/api/events/${eventId}/add-to-series/${parentId}`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Toggle an event as a series parent (admin only)
 * @param {number} eventId - Event ID to toggle
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Result with is_recurring status
 */
export const toggleSeriesParent = async (eventId, firebaseUid) => {
  return api.post(`/api/events/${eventId}/toggle-series-parent`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Dissolve a series - unlink all children (admin only)
 * @param {number} eventId - Parent event ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Result message
 */
export const dissolveSeries = async (eventId, firebaseUid) => {
  return api.post(`/api/events/${eventId}/dissolve-series`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Remove an event from its series (admin only)
 * @param {number} eventId - Event ID to remove
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Result message
 */
export const removeEventFromSeries = async (eventId, firebaseUid) => {
  return api.post(`/api/events/${eventId}/remove-from-series`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};


// ========== Event Group Functions (iOS-style folder grouping) ==========

/**
 * Merge two events into a group (admin/committee only)
 * @param {number} eventAId - Event being dragged
 * @param {number} eventBId - Event being dropped onto
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Merge result with group info
 */
export const mergeEventsToGroup = async (eventAId, eventBId, firebaseUid) => {
  return api.post('/api/events/groups/merge', {
    event_a_id: eventAId,
    event_b_id: eventBId,
  }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Remove an event from its group (admin/committee only)
 * @param {number} eventId - Event ID to remove
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Result with group_dissolved flag
 */
export const removeEventFromGroup = async (eventId, firebaseUid) => {
  return api.post(`/api/events/${eventId}/remove-from-group`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Get highlight events organized by groups
 * @returns {Promise<Object>} - { groups, standalone_events }
 */
export const getHighlightsGrouped = async () => {
  return api.get('/api/events/highlights/grouped');
};

/**
 * Update the display name of an event group
 * @param {number} parentId - Parent event ID
 * @param {string} groupName - New group name (English)
 * @param {string} groupNameCn - New group name (Chinese)
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Updated group info
 */
export const updateGroupName = async (parentId, groupName, groupNameCn, firebaseUid) => {
  return api.put(`/api/events/groups/${parentId}/name`, {
    group_name: groupName,
    group_name_cn: groupNameCn,
  }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Undo a recent merge operation
 * @param {number} parentId - Parent event ID
 * @param {number} eventId - Event that was just added
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Result with group_dissolved flag
 */
export const undoGroupMerge = async (parentId, eventId, firebaseUid) => {
  return api.post(`/api/events/groups/${parentId}/undo-merge?event_id=${eventId}`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};
