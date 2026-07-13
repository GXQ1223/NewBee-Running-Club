import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import InfoIcon from '@mui/icons-material/Info';
import StarIcon from '@mui/icons-material/Star';
import {
  Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, IconButton, MenuItem, Snackbar, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EventCard from '../components/EventCard';
import EventComposer from '../components/EventComposer';
import EventDetailModal from '../components/EventDetailModal';
import { useAdmin, useAuth } from '../context';
import { getEventsByStatus, updateEvent, deleteEvent } from '../api';
import { ORANGE, ORANGE_DARK, LINE, INK, MUTED } from '../theme/tokens';

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

export default function CalendarPage() {
  const { adminModeEnabled } = useAdmin();
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [filters, setFilters] = useState({ date: '' });

  // Admin event management state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerEvent, setComposerEvent] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Single fetch/transform used by the initial load, EventComposer's onSaved
  // and the post-delete refresh. Keeps the camelCase projection that
  // EventDetailModal (and the deep-link lookup) rely on.
  const fetchEvents = useCallback(async () => {
    try {
      const events = await getEventsByStatus('Upcoming');
      const currentYear = new Date().getFullYear();

      const transformedEvents = events
        .filter(event => {
          // Only include events from the current year
          const eventYear = parseInt((event.date || '').split('-')[0], 10);
          return eventYear === currentYear;
        })
        .map(event => {
          // Parse the event date and time for the date filter
          const [year, month, day] = (event.date || '').split('-').map(Number);
          const timeStr = event.time || '';
          const timeParts = timeStr ? timeStr.split(':').map(Number) : [0, 0];
          const isPM = timeStr ? timeStr.toLowerCase().includes('pm') : false;
          const hours = Math.min(Math.max(timeParts[0] || 0, 0), 23);
          const minutes = Math.min(Math.max(timeParts[1] || 0, 0), 59);
          const parsedDate = new Date(year, month - 1, day, isPM ? hours + 12 : hours, minutes);

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
            image: event.image,
            image_position: event.image_position,
            signupLink: event.signup_link,
            status: event.status,
            eventType: event.event_type || 'standard',
            heyloEmbed: event.heylo_embed || '',
            wechatQrCode: event.wechat_qr_code || '',
            parsedDate,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date)); // Chronological order

      setUpcomingEvents(transformedEvents);
      setFeaturedEvents(transformedEvents.slice(0, 3));
    } catch (error) {
      console.error('Error loading events:', error);
      setSnackbar({ open: true, message: 'Failed to load events / 加载活动失败', severity: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Deep-link: auto-open event modal from ?event=ID
  useEffect(() => {
    const eventId = searchParams.get('event');
    if (eventId && upcomingEvents.length > 0) {
      const event = upcomingEvents.find(ev => String(ev.id) === eventId);
      if (event) {
        setSelectedEvent(event);
      }
    }
  }, [searchParams, upcomingEvents]);

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setSearchParams({ event: event.id });
  };

  const handleEventClose = () => {
    setSelectedEvent(null);
    setSearchParams({});
  };

  const handleShareEvent = (event) => {
    const url = `${window.location.origin}/calendar?event=${event.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setSnackbar({ open: true, message: 'Link copied / 链接已复制', severity: 'success' });
    }).catch(() => {
      setSnackbar({ open: true, message: 'Failed to copy link / 复制链接失败', severity: 'error' });
    });
  };

  const handleFilterChange = (field) => (event) => {
    setFilters({
      ...filters,
      [field]: event.target.value
    });
  };

  const handleAddEvent = () => {
    setComposerEvent(null);
    setComposerOpen(true);
  };

  const handleEditEvent = (event) => {
    setComposerEvent(event);
    setComposerOpen(true);
  };

  const handleDeleteEvent = (event) => {
    setEventToDelete(event);
    setDeleteDialogOpen(true);
  };

  const handleMoveToMemories = async (event) => {
    if (!currentUser?.uid) {
      setSnackbar({ open: true, message: 'You must be logged in / 您必须登录', severity: 'error' });
      return;
    }
    try {
      // Move from Upcoming -> Past (Memories). Highlight curation is a
      // separate toggle in the event composer and is preserved here.
      await updateEvent(event.id, { status: 'Past' }, currentUser.uid);
      setUpcomingEvents(prev => prev.filter(ev => ev.id !== event.id));
      setSnackbar({ open: true, message: 'Event moved to Memories / 活动已移至回忆', severity: 'success' });
    } catch (error) {
      console.error('Error moving event to memories:', error);
      setSnackbar({ open: true, message: 'Failed to move event / 移动活动失败', severity: 'error' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete || !currentUser?.uid) {
      setSnackbar({ open: true, message: 'Unable to delete event / 无法删除活动', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      await deleteEvent(eventToDelete.id, currentUser.uid);
      setSnackbar({ open: true, message: 'Event deleted successfully / 活动已删除', severity: 'success' });
      setDeleteDialogOpen(false);
      setEventToDelete(null);
      await fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      setSnackbar({ open: true, message: `Error: ${error.message || 'Failed to delete event'}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // Small icon cluster passed into EventCard's top-right slot (the card
  // wrapper already stopPropagation's clicks, so plain handlers suffice)
  const renderAdminActions = (event) => (
    <>
      <Tooltip title="Edit event / 编辑活动">
        <IconButton size="small" aria-label="edit event" onClick={() => handleEditEvent(event)}>
          <EditIcon sx={{ fontSize: 16 }} color="primary" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete event / 删除活动">
        <IconButton size="small" aria-label="delete event" onClick={() => handleDeleteEvent(event)}>
          <DeleteIcon sx={{ fontSize: 16 }} color="error" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Move to Memories / 移至回忆">
        <IconButton size="small" aria-label="move to memories" onClick={() => handleMoveToMemories(event)}>
          <StarIcon sx={{ fontSize: 16, color: '#FFB84D' }} />
        </IconButton>
      </Tooltip>
    </>
  );

  // Filter events based on the selected date range
  const filteredEvents = upcomingEvents.filter(event => {
    if (filters.date) {
      const referenceDate = new Date();
      referenceDate.setHours(0, 0, 0, 0);
      const thisWeek = new Date(referenceDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
      const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 2, 0);

      switch (filters.date) {
        case 'this-week':
          if (event.parsedDate > thisWeek) return false;
          break;
        case 'this-month':
          if (event.parsedDate > thisMonth) return false;
          break;
        case 'next-month':
          if (event.parsedDate > nextMonth || event.parsedDate < referenceDate) return false;
          break;
        default:
          break;
      }
    }

    return true;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Admin Mode Alert */}
      {adminModeEnabled && (
        <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 2 }}>
          <Alert
            severity="info"
            icon={<InfoIcon />}
          >
            Admin mode enabled. You can add, edit, and delete events. / 管理员模式已开启，您可以添加、编辑和删除活动。
          </Alert>
        </Container>
      )}

      {/* Featured Upcoming Events */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Upcoming Events
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            近期活动
          </Typography>
        </Box>

        {adminModeEnabled && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddEvent}
              disableElevation
              sx={{
                backgroundColor: ORANGE,
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                boxShadow: '0 2px 6px rgba(255, 165, 0, 0.3)',
                '&:hover': {
                  backgroundColor: ORANGE_DARK,
                }
              }}
            >
              Add Event / 添加活动
            </Button>
          </Box>
        )}

        <Grid container spacing={3}>
          {featuredEvents.map((event) => (
            <Grid item xs={12} md={4} key={event.id}>
              <EventCard
                event={event}
                density="grid"
                showDescription
                onClick={handleEventClick}
                onShare={handleShareEvent}
                adminActions={adminModeEnabled ? renderAdminActions(event) : null}
              />
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* All Upcoming Events */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: INK }}>
            All Upcoming
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            全部活动
          </Typography>
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
                <MenuItem value="this-week">This Week</MenuItem>
                <MenuItem value="this-month">This Month</MenuItem>
                <MenuItem value="next-month">Next Month</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* Events List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              density="row"
              onClick={handleEventClick}
              onShare={handleShareEvent}
              adminActions={adminModeEnabled ? renderAdminActions(event) : null}
            />
          ))}
        </Box>
      </Container>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={handleEventClose}
          onEventUpdate={(updatedEvent) => {
            setSelectedEvent(updatedEvent);
            const updateList = (list) => list.map(ev =>
              ev.id === updatedEvent.id ? { ...ev, ...updatedEvent } : ev
            );
            setUpcomingEvents(updateList);
            setFeaturedEvents(updateList);
          }}
        />
      )}

      {/* Create/Edit Composer */}
      <EventComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        event={composerEvent}
        onSaved={fetchEvents}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>
          Delete Event / 删除活动
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{eventToDelete?.name || eventToDelete?.title}"?
          </Typography>
          <Typography color="text.secondary">
            您确定要删除 "{eventToDelete?.chineseName || eventToDelete?.chineseTitle || eventToDelete?.name || eventToDelete?.title}" 吗？
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. / 此操作无法撤销。
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={loading}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Delete / 删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
