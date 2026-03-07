import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import { Alert, Box, Button, Card, CardContent, CardMedia, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Menu, MenuItem, Snackbar, TextField, Typography } from '@mui/material';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, useSensor, useSensors, TouchSensor, MouseSensor, closestCenter } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import NavigationButtons from '../components/NavigationButtons';
import EventEngagementBar from '../components/EventEngagementBar';
import EventGalleryPreview from '../components/EventGalleryPreview';
import EventDetailModal from '../components/EventDetailModal';
import EventGroupCard from '../components/EventGroupCard';
import EventGroupGalleryModal from '../components/EventGroupGalleryModal';
import UndoSnackbar from '../components/UndoSnackbar';
import { getEventsByStatus, getBatchEngagement, toggleSeriesParent, getHighlightsGrouped, mergeEventsToGroup, removeEventFromGroup, undoGroupMerge, deleteEvent } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

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
        const [year, month, day] = event.date.split('-').map(Number);
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
          image: event.image || '/images/2025/20250517_bk_half.jpg',
          signupLink: event.signup_link,
          status: event.status,
          parsedDate: eventDate,
          is_recurring: event.is_recurring,
          parent_event_id: event.parent_event_id,
          group_name: event.group_name,
          group_name_cn: event.group_name_cn
        };
      }).sort((a, b) => b.date.localeCompare(a.date));

      setStandaloneEvents(standalone);
      setPastEvents(standalone); // Keep for backwards compatibility

      // Fetch engagement data for all events
      const allEventIds = [
        ...standalone.map(e => e.id),
        ...groupedData.groups.flatMap(g => g.events.map(e => e.id))
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
                image: draggedEvent.image
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
            image: targetStandaloneEvent.image
          },
          {
            id: draggedEvent.id,
            name: draggedEvent.name,
            chinese_name: draggedEvent.chineseName,
            date: draggedEvent.date,
            time: draggedEvent.time,
            location: draggedEvent.location,
            chinese_location: draggedEvent.chineseLocation,
            image: draggedEvent.image
          }
        ],
        cover_image: targetStandaloneEvent.image,
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
      image: event.image
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

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = '/images/2025/20250517_bk_half.jpg';
  };

  const handleShare = async (e, eventId, eventName) => {
    e.stopPropagation();
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
        });
        return;
      }
    }
  }, [searchParams, standaloneEvents, featuredEvents, eventGroups]);

  useEffect(() => {
    const fetchEvents = async () => {
      await refreshEvents();

      // Also fetch for featured events (first 3 from all highlight events)
      try {
        const events = await getEventsByStatus('Highlight');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const transformedEvents = events
          .filter(event => new Date(event.date) < today)
          .map(event => ({
            id: event.id,
            name: event.name,
            chineseName: event.chinese_name,
            date: event.date,
            time: event.time,
            location: event.location,
            chineseLocation: event.chinese_location,
            description: event.description,
            chineseDescription: event.chinese_description,
            image: event.image || '/images/2025/20250517_bk_half.jpg',
          }))
          .sort((a, b) => b.date.localeCompare(a.date));

        // Set featured events (first 3)
        const featured = transformedEvents.slice(0, 3).map(event => ({
          id: event.id,
          title: event.name,
          chineseTitle: event.chineseName,
          image: event.image,
          description: event.description,
          date: event.date,
          time: event.time,
          location: event.location,
          chineseLocation: event.chineseLocation,
          chineseDescription: event.chineseDescription
        }));
        setFeaturedEvents(featured);
      } catch (error) {
        console.error('Error loading featured events:', error);
      }
    };

    fetchEvents();
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
      {/* Navigation Buttons */}
      <NavigationButtons />
      
      {/* Featured Events Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          Featured Memories
          <br />
          精选回忆
        </Typography>
        
        <Grid container spacing={3}>
          {featuredEvents.map((event) => (
            <Grid item xs={12} md={4} key={event.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    transition: 'transform 0.3s ease-in-out'
                  }
                }}
                onClick={() => handleEventClick(event)}
              >
                <Box sx={{ position: 'relative' }}>
                  <CardMedia
                    component="img"
                    height="200"
                    image={event.image}
                    alt={event.title}
                    loading="lazy"
                    onError={handleImageError}
                    sx={{
                      objectFit: 'cover',
                      backgroundColor: '#f5f5f5'
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => handleShare(e, event.id, event.title)}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 1)' },
                    }}
                  >
                    <ShareIcon fontSize="small" />
                  </IconButton>
                </Box>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography gutterBottom variant="h6" component="div" sx={{
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {event.title}
                  </Typography>
                  <Typography gutterBottom variant="subtitle1" color="text.secondary" sx={{
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    minHeight: '1.75em',
                  }}>
                    {event.chineseTitle || '\u00A0'}
                  </Typography>
                  <Box sx={{ mb: 1 }}>
                    <EventGalleryPreview eventId={event.id} maxImages={4} size={40} />
                  </Box>
                  <Box sx={{ mb: 1 }}>
                    <EventEngagementBar
                      eventId={event.id}
                      initialData={engagementData[event.id]}
                    />
                  </Box>
                  <Button
                    variant="contained"
                    sx={{
                      mt: 'auto',
                      backgroundColor: '#FFB84D',
                      color: 'white',
                      textTransform: 'none',
                      fontSize: '16px',
                      px: 2,
                      py: 1.5,
                      borderRadius: '12px',
                      border: '2px solid #FFB84D',
                      '&:hover': {
                        backgroundColor: '#FFA833',
                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                        transform: 'translateY(-2px)',
                      },
                      '&:active': {
                        transform: 'translateY(1px) scale(0.98)',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                      }
                    }}
                  >
                    View Details 查看详情
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Past Events Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 6 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          Memories
          <br />
          回忆
        </Typography>

        {/* Filters */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Grid container spacing={2} sx={{ maxWidth: 1000 }}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
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
                  border: isOver ? '3px dashed #FFA500' : 'none',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease-in-out',
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
                    <Card
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        minHeight: { xs: 'auto', sm: '200px' },
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out',
                        opacity: isDragging ? 0.5 : 1,
                        border: isOver ? '3px dashed #FFA500' : 'none',
                        '&:hover': {
                          transform: isDragging ? 'none' : 'translateY(-2px)',
                          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
                        },
                      }}
                      onClick={() => !isDragging && handleEventClick(event)}
                    >
                      {/* Mobile: Image at top */}
                      <Box
                        sx={{
                          display: { xs: 'block', sm: 'none' },
                          width: '100%',
                          height: '150px',
                          position: 'relative'
                        }}
                      >
                        <CardMedia
                          component="img"
                          loading="lazy"
                          sx={{
                            height: '100%',
                            width: '100%',
                            objectFit: 'cover',
                            backgroundColor: '#f5f5f5'
                          }}
                          image={event.image}
                          alt={event.name}
                          onError={handleImageError}
                        />
                        {/* Mobile drag handle - long press to drag */}
                        {adminModeEnabled && (
                          <Box
                            {...dragHandleProps}
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              zIndex: 10,
                              cursor: 'grab',
                            }}
                          >
                            <Chip
                              icon={<DragIndicatorIcon sx={{ fontSize: 16 }} />}
                              label="Hold to drag"
                              size="small"
                              sx={{
                                backgroundColor: 'rgba(255, 165, 0, 0.95)',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            />
                          </Box>
                        )}
                      </Box>

                      {/* Time Column - hidden on mobile, shown on sm+ */}
                      <Box
                        sx={{
                          display: { xs: 'none', sm: 'flex' },
                          width: '120px',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: 'white',
                          color: '#FFA500',
                          p: 2,
                          borderRight: '1px solid #e0e0e0',
                          whiteSpace: 'nowrap',
                          position: 'relative'
                        }}
                      >
                        {/* Desktop drag handle */}
                        {adminModeEnabled && (
                          <Box
                            {...dragHandleProps}
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                              position: 'absolute',
                              top: 8,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              cursor: 'grab',
                              padding: '4px',
                              borderRadius: '4px',
                              '&:hover': {
                                backgroundColor: 'rgba(255, 165, 0, 0.2)',
                              },
                            }}
                          >
                            <DragIndicatorIcon
                              sx={{
                                color: '#FFA500',
                                fontSize: 20,
                              }}
                            />
                          </Box>
                        )}
                <Typography variant="h6" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {event.time}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {event.date}
                </Typography>
              </Box>

              {/* Image Column - hidden on mobile, shown on sm+ */}
              <Box
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  width: '200px',
                  flexShrink: 0
                }}
              >
                <CardMedia
                  component="img"
                  loading="lazy"
                  sx={{
                    height: '100%',
                    width: '100%',
                    objectFit: 'cover',
                    backgroundColor: '#f5f5f5'
                  }}
                  image={event.image}
                  alt={event.name}
                  onError={handleImageError}
                />
              </Box>

              {/* Content Column */}
              <Box
                sx={{
                  flex: 1,
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative'
                }}
              >
                {/* Share and admin buttons */}
                <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={(e) => handleShare(e, event.id, event.name)}
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 1)' },
                    }}
                  >
                    <ShareIcon fontSize="small" />
                  </IconButton>
                  {adminModeEnabled && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, event.id)}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': { backgroundColor: 'rgba(255, 165, 0, 0.2)' }
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                {/* Mobile: Show date/time at top of content */}
                <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 2, mb: 1, color: '#FFA500' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {event.time}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary">
                    {event.date}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-start' }, mb: 1, gap: 1 }}>
                  <Box>
                    <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                      {event.name}
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                      {event.chineseName}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    sx={{
                      backgroundColor: '#FFB84D',
                      color: 'white',
                      textTransform: 'none',
                      fontSize: { xs: '14px', sm: '16px' },
                      px: { xs: 1.5, sm: 2 },
                      py: { xs: 1, sm: 1.5 },
                      borderRadius: '12px',
                      border: '2px solid #FFB84D',
                      flexShrink: 0,
                      '&:hover': {
                        backgroundColor: '#FFA833',
                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                        transform: 'translateY(-2px)',
                      },
                      '&:active': {
                        transform: 'translateY(1px) scale(0.98)',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEventClick(event);
                    }}
                  >
                    View Details 查看详情
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.location}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.chineseLocation}
                </Typography>
                <EventGalleryPreview eventId={event.id} maxImages={5} size={36} />
                <Box sx={{ mt: 'auto' }}>
                  <EventEngagementBar
                    eventId={event.id}
                    initialData={engagementData[event.id]}
                  />
                </Box>
              </Box>
                    </Card>
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
              sx={{
                minHeight: '80px',
                maxWidth: '300px',
                p: 2,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
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
          <PlaylistAddIcon sx={{ mr: 1, color: '#FFA500' }} />
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