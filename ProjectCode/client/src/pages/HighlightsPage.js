import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Card, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Menu, MenuItem, Snackbar, TextField, Typography } from '@mui/material';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, useSensor, useSensors, TouchSensor, MouseSensor, closestCenter } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import EventCard from '../components/EventCard';
import EventDetailModal from '../components/EventDetailModal';
import EventGroupCard from '../components/EventGroupCard';
import EventGroupGalleryModal from '../components/EventGroupGalleryModal';
import UndoSnackbar from '../components/UndoSnackbar';
import { getBatchEngagement, toggleSeriesParent, getHighlightsGrouped, mergeEventsToGroup, removeEventFromGroup, undoGroupMerge, deleteEvent, createEvent } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import {
  ORANGE, ORANGE_DARK, ORANGE_BG, LINE, INK, MUTED,
  CARD_SHADOW, CARD_HOVER_SHADOW, FALLBACK_EVENT_IMAGE,
} from '../theme/tokens';

// Pill styling for the filter selects
const filterPillSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '99px',
    backgroundColor: 'white',
    '& fieldset': { borderColor: LINE },
    '&:hover fieldset': { borderColor: ORANGE },
    '&.Mui-focused fieldset': { borderColor: ORANGE },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
};

// Draggable wrapper - only the drag handle activates dragging
function DraggableEventCard({ id, children, disabled }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 1000,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragHandleProps: {
          ref: setActivatorNodeRef,
          ...listeners,
          ...attributes,
          style: { touchAction: 'none' }  // Only disable touch-action on the handle
        },
        isDragging
      })}
    </div>
  );
}

// Droppable wrapper
function DroppableEventCard({ id, children, disabled }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    disabled,
  });

  return (
    <div ref={setNodeRef}>
      {children({ isOver })}
    </div>
  );
}

export default function HighlightsPage() {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [searchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [pastEvents, setPastEvents] = useState([]);
  const [eventGroups, setEventGroups] = useState([]);
  const [standaloneEvents, setStandaloneEvents] = useState([]);
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [engagementData, setEngagementData] = useState({});
  const [filters, setFilters] = useState({
    showAvailable: true,
    date: '',
    location: '',
    distance: '',
    status: ''
  });
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuEventId, setMenuEventId] = useState(null);

  // Event group state
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupGalleryOpen, setGroupGalleryOpen] = useState(false);
  const [undoSnackbarOpen, setUndoSnackbarOpen] = useState(false);
  const [undoData, setUndoData] = useState(null); // { parentId, eventId, message }
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Add event state
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addEventLoading, setAddEventLoading] = useState(false);
  const [addEventForm, setAddEventForm] = useState({
    name: '', chinese_name: '', date: '', time: '',
    location: '', chinese_location: '',
    description: '', chinese_description: '',
    image: '', status: 'Past', is_highlight: true,
  });

  // Sensors: TouchSensor with 250ms delay (long press like iOS), MouseSensor with distance
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,        // 250ms long press to start drag
        tolerance: 5,      // 5px movement allowed during delay
      },
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    setDraggedEventId(parseInt(event.active.id));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    setDraggedEventId(null);

    if (!over || !adminModeEnabled) return;

    const draggedId = parseInt(active.id);
    const targetId = parseInt(over.id);

    if (draggedId && targetId && draggedId !== targetId) {
      handleMergeEvents(draggedId, targetId);
    }
  };

  const handleMenuOpen = (event, eventId) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuEventId(eventId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuEventId(null);
  };

  const handleDeleteEvent = () => {
    const event = [...standaloneEvents, ...pastEvents].find(e => e.id === menuEventId);
    if (event) {
      setEventToDelete(event);
      setDeleteDialogOpen(true);
    }
    handleMenuClose();
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete || !currentUser?.uid) return;
    setDeleteLoading(true);
    try {
      await deleteEvent(eventToDelete.id, currentUser.uid);
      setDeleteDialogOpen(false);
      setEventToDelete(null);
      setSnackbar({ open: true, message: 'Event deleted / 活动已删除', severity: 'success' });
      refreshEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      setSnackbar({ open: true, message: 'Failed to delete event / 删除活动失败', severity: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddEventFormChange = (field) => (e) => {
    setAddEventForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleAddEventSubmit = async () => {
    if (!addEventForm.name || !addEventForm.date) {
      setSnackbar({ open: true, message: 'Name and date are required / 名称和日期为必填项', severity: 'error' });
      return;
    }
    if (!currentUser?.uid) {
      setSnackbar({ open: true, message: 'You must be logged in / 请先登录', severity: 'error' });
      return;
    }
    setAddEventLoading(true);
    try {
      const eventData = Object.fromEntries(
        Object.entries(addEventForm).map(([key, value]) => [key, value === '' ? null : value])
      );
      // This dialog adds curated Featured Memories — lifecycle=Past, featured=true
      eventData.status = 'Past';
      eventData.is_highlight = true;
      await createEvent(eventData, currentUser.uid);
      setAddEventOpen(false);
      setAddEventForm({
        name: '', chinese_name: '', date: '', time: '',
        location: '', chinese_location: '',
        description: '', chinese_description: '',
        image: '', status: 'Past', is_highlight: true,
      });
      setSnackbar({ open: true, message: 'Event created / 活动已创建', severity: 'success' });
      await refreshEvents();
    } catch (error) {
      console.error('Error creating event:', error);
      setSnackbar({ open: true, message: `Failed to create event: ${error.message}`, severity: 'error' });
    } finally {
      setAddEventLoading(false);
    }
  };

  const refreshEvents = useCallback(async () => {
    try {
      // Fetch grouped highlights
      const groupedData = await getHighlightsGrouped();

      // Filter out groups with only 1 event - treat them as standalone (defensive check)
      const multiEventGroups = (groupedData.groups || []).filter(g => g.event_count > 1);
      const singleEventGroups = (groupedData.groups || []).filter(g => g.event_count <= 1);

      // Convert single-event groups to standalone event format
      const convertedFromGroups = singleEventGroups.flatMap(g => g.events || []);

      // Combine standalone events with converted single-event groups
      const allStandaloneEvents = [...(groupedData.standalone_events || []), ...convertedFromGroups];

      setEventGroups(multiEventGroups);

      // Transform standalone events
      const standalone = allStandaloneEvents.map(event => {
        const [year, month, day] = (event.date || '').split('-').map(Number);
        const timeParts = event.time ? event.time.split(':').map(Number) : [0, 0];
        const isPM = event.time ? event.time.toLowerCase().includes('pm') : false;
        const eventDate = new Date(year, month - 1, day, isPM ? timeParts[0] + 12 : timeParts[0], timeParts[1] || 0);
        return {
          id: event.id,
          name: event.name,
          chineseName: event.chinese_name,
          date: event.date,
          time: event.time,
          location: event.location,
          chineseLocation: event.chinese_location,
          description: event.description,
          chineseDescription: event.chinese_description,
          image: event.image || FALLBACK_EVENT_IMAGE,
          image_position: event.image_position,
          signupLink: event.signup_link,
          status: event.status,
          is_highlight: !!event.is_highlight,
          parsedDate: eventDate,
          is_recurring: event.is_recurring,
          parent_event_id: event.parent_event_id,
          group_name: event.group_name,
          group_name_cn: event.group_name_cn
        };
      }).sort((a, b) => b.date.localeCompare(a.date));

      setStandaloneEvents(standalone);
      setPastEvents(standalone); // Keep for backwards compatibility

      // Featured Memories = past + is_highlight, top 3 (covers both grouped and standalone)
      const allPastEvents = [
        ...standalone,
        ...(groupedData.groups || []).flatMap(g => (g.events || []).map(e => ({
          id: e.id,
          name: e.name,
          chineseName: e.chinese_name,
          date: e.date,
          time: e.time,
          location: e.location,
          chineseLocation: e.chinese_location,
          image: e.image || FALLBACK_EVENT_IMAGE,
          image_position: e.image_position,
          status: e.status,
          is_highlight: !!e.is_highlight,
        })))
      ];
      const featured = allPastEvents
        .filter(e => e.is_highlight)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 3)
        .map(e => ({
          id: e.id,
          title: e.name,
          chineseTitle: e.chineseName,
          image: e.image,
          image_position: e.image_position,
          description: e.description,
          date: e.date,
          time: e.time,
          location: e.location,
          chineseLocation: e.chineseLocation,
          chineseDescription: e.chineseDescription,
          // Featured cards are memories — never let EventCard default to Upcoming
          status: e.status || 'Past'
        }));
      setFeaturedEvents(featured);

      // Fetch engagement data for all events
      const allEventIds = [
        ...standalone.map(e => e.id),
        ...(groupedData.groups || []).flatMap(g => (g.events || []).map(e => e.id))
      ];

      if (allEventIds.length > 0) {
        try {
          const batchResult = await getBatchEngagement(allEventIds, currentUser?.uid);
          setEngagementData(batchResult.engagements || {});
        } catch (engagementError) {
          console.error('Error fetching engagement data:', engagementError);
        }
      }
    } catch (error) {
      console.error('Error refreshing events:', error);
    }
  }, [currentUser?.uid]);

  // Handle merging events via drag and drop
  const handleMergeEvents = async (draggedEventId, targetEventId) => {
    if (!currentUser?.uid) return;

    // Check if target is an existing group or a standalone event
    const targetGroup = eventGroups.find(g => g.parent_event_id === targetEventId);
    const targetStandaloneEvent = standaloneEvents.find(e => e.id === targetEventId);
    const draggedEvent = standaloneEvents.find(e => e.id === draggedEventId);

    // Optimistically update UI immediately
    if (targetGroup) {
      // Dragging to an existing group - remove dragged event and add to group
      setStandaloneEvents(prev => prev.filter(e => e.id !== draggedEventId));
      if (draggedEvent) {
        setEventGroups(prev => prev.map(g => {
          if (g.parent_event_id === targetEventId) {
            return {
              ...g,
              events: [...g.events, {
                id: draggedEvent.id,
                name: draggedEvent.name,
                chinese_name: draggedEvent.chineseName,
                date: draggedEvent.date,
                time: draggedEvent.time,
                location: draggedEvent.location,
                chinese_location: draggedEvent.chineseLocation,
                image: draggedEvent.image,
                image_position: draggedEvent.image_position
              }],
              event_count: g.event_count + 1
            };
          }
          return g;
        }));
      }
    } else if (targetStandaloneEvent && draggedEvent) {
      // Dragging standalone to another standalone - remove BOTH and create new group
      setStandaloneEvents(prev => prev.filter(e => e.id !== draggedEventId && e.id !== targetEventId));

      // Add new group optimistically
      const newGroup = {
        parent_event_id: targetEventId,
        group_name: targetStandaloneEvent.name,
        group_name_cn: targetStandaloneEvent.chineseName,
        event_count: 2,
        events: [
          {
            id: targetStandaloneEvent.id,
            name: targetStandaloneEvent.name,
            chinese_name: targetStandaloneEvent.chineseName,
            date: targetStandaloneEvent.date,
            time: targetStandaloneEvent.time,
            location: targetStandaloneEvent.location,
            chinese_location: targetStandaloneEvent.chineseLocation,
            image: targetStandaloneEvent.image,
            image_position: targetStandaloneEvent.image_position
          },
          {
            id: draggedEvent.id,
            name: draggedEvent.name,
            chinese_name: draggedEvent.chineseName,
            date: draggedEvent.date,
            time: draggedEvent.time,
            location: draggedEvent.location,
            chinese_location: draggedEvent.chineseLocation,
            image: draggedEvent.image,
            image_position: draggedEvent.image_position
          }
        ],
        cover_image: targetStandaloneEvent.image,
        cover_image_position: targetStandaloneEvent.image_position,
        cover_event_id: targetStandaloneEvent.id,
        most_recent_date: targetStandaloneEvent.date
      };
      setEventGroups(prev => [newGroup, ...prev]);
    }

    try {
      const result = await mergeEventsToGroup(draggedEventId, targetEventId, currentUser.uid);

      // Store undo data
      setUndoData({
        parentId: result.parent_event_id,
        eventId: draggedEventId,
        message: result.message
      });
      setUndoSnackbarOpen(true);

      // Refresh events to sync with server
      await refreshEvents();
    } catch (error) {
      console.error('Error merging events:', error);
      // Refresh to restore correct state on error
      await refreshEvents();
    }
  };

  // Handle undo merge
  const handleUndoMerge = async () => {
    if (!undoData || !currentUser?.uid) return;

    try {
      await undoGroupMerge(undoData.parentId, undoData.eventId, currentUser.uid);
      await refreshEvents();
    } catch (error) {
      console.error('Error undoing merge:', error);
    }

    setUndoData(null);
  };

  // Handle removing event from group
  const handleRemoveFromGroup = async (eventId) => {
    if (!currentUser?.uid) return;

    try {
      // Optimistically update the UI immediately
      if (selectedGroup) {
        const updatedEvents = selectedGroup.events.filter(e => e.id !== eventId);
        if (updatedEvents.length <= 1) {
          // Group will be dissolved, close the gallery
          setGroupGalleryOpen(false);
          setSelectedGroup(null);
        } else {
          // Update the selected group with the event removed
          setSelectedGroup({
            ...selectedGroup,
            events: updatedEvents,
            event_count: updatedEvents.length
          });
        }
      }

      await removeEventFromGroup(eventId, currentUser.uid);
      await refreshEvents();
    } catch (error) {
      console.error('Error removing event from group:', error);
      // Refresh to restore correct state on error
      await refreshEvents();
    }
  };

  // Handle group card click - open gallery modal
  const handleGroupClick = (group) => {
    setSelectedGroup(group);
    setGroupGalleryOpen(true);
  };

  // Handle event click from within group gallery
  // Keep the group gallery open so user returns to it when closing the event detail
  const handleGroupEventClick = (event) => {
    setSelectedEvent({
      id: event.id,
      name: event.name,
      chineseName: event.chinese_name,
      date: event.date,
      time: event.time,
      location: event.location,
      chineseLocation: event.chinese_location,
      image: event.image,
      image_position: event.image_position
    });
  };

  const handleToggleSeriesParent = async () => {
    if (!menuEventId || !currentUser?.uid) return;
    try {
      const result = await toggleSeriesParent(menuEventId, currentUser.uid);
      setUndoData({ message: result.message });
      setUndoSnackbarOpen(true);
      await refreshEvents();
    } catch (error) {
      console.error('Error toggling series parent:', error);
    }
    handleMenuClose();
  };

  const handleShare = async (eventId) => {
    const shareUrl = `${window.location.origin}/highlights?event=${eventId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSnackbar({
        open: true,
        message: 'Copied to clipboard / 已复制到剪贴板',
        severity: 'success',
      });
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      setSnackbar({
        open: true,
        message: 'Failed to copy / 复制失败',
        severity: 'error',
      });
    }
  };

  // Deep-link: auto-open event modal from ?event= query param
  useEffect(() => {
    const eventIdParam = searchParams.get('event');
    if (!eventIdParam) return;
    const eventId = parseInt(eventIdParam, 10);
    if (isNaN(eventId)) return;

    // Search in standalone events
    const found = standaloneEvents.find(e => e.id === eventId);
    if (found) {
      setSelectedEvent(found);
      return;
    }

    // Search in featured events
    const featuredFound = featuredEvents.find(e => e.id === eventId);
    if (featuredFound) {
      setSelectedEvent(featuredFound);
      return;
    }

    // Search in event groups
    for (const group of eventGroups) {
      const groupEvent = group.events?.find(e => e.id === eventId);
      if (groupEvent) {
        setSelectedEvent({
          id: groupEvent.id,
          name: groupEvent.name,
          chineseName: groupEvent.chinese_name,
          date: groupEvent.date,
          time: groupEvent.time,
          location: groupEvent.location,
          chineseLocation: groupEvent.chinese_location,
          image: groupEvent.image,
          image_position: groupEvent.image_position,
        });
        return;
      }
    }
  }, [searchParams, standaloneEvents, featuredEvents, eventGroups]);

  useEffect(() => {
    refreshEvents();
  }, [currentUser?.uid, refreshEvents]);

  const handleEventClick = (event) => {
    // For featured events, we need to find the full event data
    if (event.id) {
      setSelectedEvent(event);
    } else {
      // For past events, we already have the full event data
      setSelectedEvent(event);
    }
  };

  const handleFilterChange = (field) => (event) => {
    setFilters({
      ...filters,
      [field]: event.target.value
    });
  };

  // Filter events based on selected filters
  const filteredEvents = pastEvents.filter(event => {
    if (filters.date) {
      const referenceDate = new Date(2025, 4, 16); // May 16, 2025
      const lastWeek = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      const lastThreeMonths = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 3, 0);

      switch (filters.date) {
        case 'last-week':
          if (event.parsedDate < lastWeek) return false;
          break;
        case 'last-month':
          if (event.parsedDate < lastMonth) return false;
          break;
        case 'last-three-months':
          if (event.parsedDate < lastThreeMonths) return false;
          break;
        default:
          break;
      }
    }

    if (filters.location && event.location.toLowerCase() !== filters.location.toLowerCase()) {
      return false;
    }

    if (filters.status && event.status.toLowerCase() !== filters.status.toLowerCase()) {
      return false;
    }

    return true;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Featured Events Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Featured Memories
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            精选回忆
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {featuredEvents.map((event) => (
            <Grid item xs={12} md={4} key={event.id}>
              <EventCard
                event={event}
                density="grid"
                showGalleryPreview
                onClick={handleEventClick}
                onShare={(ev) => handleShare(ev.id)}
              />
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Past Events Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Memories
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            回忆
          </Typography>
          {adminModeEnabled && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddEventOpen(true)}
              disableElevation
              sx={{
                ml: 'auto',
                backgroundColor: ORANGE,
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                boxShadow: '0 2px 6px rgba(255, 165, 0, 0.3)',
                '&:hover': { backgroundColor: ORANGE_DARK },
                flexShrink: 0,
              }}
            >
              Add Event
            </Button>
          )}
        </Box>

        {/* Filters */}
        <Box sx={{ display: 'flex', mb: 3 }}>
          <Grid container spacing={2} sx={{ maxWidth: 1000 }}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterPillSx}
              label="Date"
              value={filters.date}
              onChange={handleFilterChange('date')}
            >
              <MenuItem value="">All Dates</MenuItem>
              <MenuItem value="last-week">Last Week</MenuItem>
              <MenuItem value="last-month">Last Month</MenuItem>
              <MenuItem value="last-three-months">Last 3 Months</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterPillSx}
              label="Location"
              value={filters.location}
              onChange={handleFilterChange('location')}
            >
              <MenuItem value="">All Locations</MenuItem>
              <MenuItem value="central-park">Central Park</MenuItem>
              <MenuItem value="track-field">Track Field</MenuItem>
              <MenuItem value="brooklyn">Brooklyn</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterPillSx}
              label="Distance"
              value={filters.distance}
              onChange={handleFilterChange('distance')}
            >
              <MenuItem value="">All Distances</MenuItem>
              <MenuItem value="5k">5K</MenuItem>
              <MenuItem value="10k">10K</MenuItem>
              <MenuItem value="half-marathon">Half Marathon</MenuItem>
              <MenuItem value="marathon">Marathon</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              sx={filterPillSx}
              label="Status"
              value={filters.status}
              onChange={handleFilterChange('status')}
            >
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          </Grid>
          </Grid>
        </Box>

        {/* Events List - Groups first, then standalone events */}
        <DndContext
          sensors={adminModeEnabled ? sensors : []}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 4 }}>
          {/* Render Event Groups */}
          {eventGroups.map((group) => (
            <DroppableEventCard key={`drop-${group.parent_event_id}`} id={group.parent_event_id} disabled={!adminModeEnabled}>
              {({ isOver }) => (
                <Box sx={{
                  border: isOver ? `3px dashed ${ORANGE}` : 'none',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                }}>
                  <EventGroupCard
                    group={group}
                    onGroupClick={handleGroupClick}
                    engagementData={engagementData[group.parent_event_id]}
                    adminModeEnabled={adminModeEnabled}
                  />
                </Box>
              )}
            </DroppableEventCard>
          ))}

          {/* Render Standalone Events */}
          {filteredEvents.map((event) => (
            <DroppableEventCard key={`drop-${event.id}`} id={event.id} disabled={!adminModeEnabled}>
              {({ isOver }) => (
                <DraggableEventCard id={event.id} disabled={!adminModeEnabled}>
                  {({ dragHandleProps, isDragging }) => (
                    <EventCard
                      event={event}
                      density="row"
                      showGalleryPreview
                      onClick={(ev) => !isDragging && handleEventClick(ev)}
                      onShare={(ev) => handleShare(ev.id)}
                      adminActions={adminModeEnabled ? (
                        <>
                          {/* Drag handle: hold (touch) or press-and-move (mouse) to merge */}
                          <Box
                            {...dragHandleProps}
                            aria-label="drag to merge"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'grab',
                              p: 0.5,
                              borderRadius: '4px',
                              '&:hover': { backgroundColor: ORANGE_BG },
                            }}
                          >
                            <DragIndicatorIcon sx={{ color: ORANGE, fontSize: 20 }} />
                          </Box>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, event.id)}
                            aria-label="event admin menu"
                            sx={{ color: MUTED, '&:hover': { color: ORANGE, backgroundColor: ORANGE_BG } }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : null}
                      sx={{
                        opacity: isDragging ? 0.5 : 1,
                        border: isOver ? `3px dashed ${ORANGE}` : `1px solid ${LINE}`,
                        ...(isDragging && {
                          '&:hover': { transform: 'none', boxShadow: CARD_SHADOW },
                        }),
                      }}
                    />
                  )}
                </DraggableEventCard>
              )}
            </DroppableEventCard>
          ))}
        </Box>

        {/* Drag Overlay - shows dragged item */}
        <DragOverlay>
          {activeId ? (
            <Card
              elevation={0}
              sx={{
                minHeight: '80px',
                maxWidth: '300px',
                p: 2,
                border: `1px solid ${LINE}`,
                borderRadius: '12px',
                boxShadow: CARD_HOVER_SHADOW,
                transform: 'rotate(3deg)',
                opacity: 0.9,
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {standaloneEvents.find(e => e.id === activeId)?.name || 'Event'}
              </Typography>
            </Card>
          ) : null}
        </DragOverlay>
        </DndContext>

        {/* Admin hint for drag-drop */}
        {adminModeEnabled && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'center', mt: 2, mb: 4 }}
          >
            Long press the drag handle to move events
          </Typography>
        )}
      </Container>

      {/* Undo Snackbar */}
      <UndoSnackbar
        open={undoSnackbarOpen}
        message={undoData?.message || 'Action completed'}
        onClose={() => setUndoSnackbarOpen(false)}
        onUndo={undoData?.eventId ? handleUndoMerge : undefined}
      />

      {/* Admin menu for regular events */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleToggleSeriesParent}>
          <PlaylistAddIcon sx={{ mr: 1, color: ORANGE }} />
          Mark as Series Parent 设为系列主活动
        </MenuItem>
        <MenuItem onClick={handleDeleteEvent}>
          <DeleteIcon sx={{ mr: 1, color: 'error.main' }} />
          Delete Event 删除活动
        </MenuItem>
      </Menu>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEventUpdate={(updatedEvent) => {
            setSelectedEvent(updatedEvent);
            const updateList = (list) => list.map(e => e.id === updatedEvent.id ? { ...e, ...updatedEvent } : e);
            setPastEvents(updateList);
            setStandaloneEvents(updateList);
            setFeaturedEvents(updateList);
          }}
        />
      )}

      {/* Event Group Gallery Modal */}
      <EventGroupGalleryModal
        open={groupGalleryOpen}
        onClose={() => {
          setGroupGalleryOpen(false);
          setSelectedGroup(null);
        }}
        group={selectedGroup}
        onEventClick={handleGroupEventClick}
        onRemoveFromGroup={handleRemoveFromGroup}
        adminModeEnabled={adminModeEnabled}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Event / 删除活动</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{eventToDelete?.name || eventToDelete?.title}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            您确定要删除 "{eventToDelete?.chineseName || eventToDelete?.chineseTitle || eventToDelete?.name || eventToDelete?.title}" 吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
            Cancel 取消
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            disabled={deleteLoading}
          >
            {deleteLoading ? <CircularProgress size={24} /> : 'Delete / 删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Event Dialog */}
      <Dialog open={addEventOpen} onClose={() => !addEventLoading && setAddEventOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Highlight Event 添加精选活动</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Event Name 活动名称 *"
              value={addEventForm.name}
              onChange={handleAddEventFormChange('name')}
              fullWidth
            />
            <TextField
              label="Chinese Name 中文名称"
              value={addEventForm.chinese_name}
              onChange={handleAddEventFormChange('chinese_name')}
              fullWidth
            />
            <TextField
              label="Date 日期 *"
              type="date"
              value={addEventForm.date}
              onChange={handleAddEventFormChange('date')}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Time 时间"
              value={addEventForm.time}
              onChange={handleAddEventFormChange('time')}
              fullWidth
              placeholder="e.g. 8:00 AM"
            />
            <TextField
              label="Location 地点"
              value={addEventForm.location}
              onChange={handleAddEventFormChange('location')}
              fullWidth
            />
            <TextField
              label="Chinese Location 中文地点"
              value={addEventForm.chinese_location}
              onChange={handleAddEventFormChange('chinese_location')}
              fullWidth
            />
            <TextField
              label="Description 描述"
              value={addEventForm.description}
              onChange={handleAddEventFormChange('description')}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              label="Chinese Description 中文描述"
              value={addEventForm.chinese_description}
              onChange={handleAddEventFormChange('chinese_description')}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              label="Image URL 图片链接"
              value={addEventForm.image}
              onChange={handleAddEventFormChange('image')}
              fullWidth
              placeholder="https://..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddEventOpen(false)} disabled={addEventLoading}>
            Cancel 取消
          </Button>
          <Button
            onClick={handleAddEventSubmit}
            variant="contained"
            disabled={addEventLoading}
            startIcon={addEventLoading ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
            sx={{ backgroundColor: ORANGE, '&:hover': { backgroundColor: ORANGE_DARK } }}
          >
            {addEventLoading ? 'Creating...' : 'Create 创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
} 