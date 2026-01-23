import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import { Box, Button, Card, CardContent, CardMedia, Container, Grid, IconButton, Menu, MenuItem, Snackbar, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import NavigationButtons from '../components/NavigationButtons';
import EventEngagementBar from '../components/EventEngagementBar';
import EventGalleryPreview from '../components/EventGalleryPreview';
import EventDetailModal from '../components/EventDetailModal';
import EventSeriesCard from '../components/EventSeriesCard';
import { getEventsByStatus, getBatchEngagement, toggleSeriesParent } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

export default function HighlightsPage() {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [pastEvents, setPastEvents] = useState([]);
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [engagementData, setEngagementData] = useState({});
  const [expandedSeriesId, setExpandedSeriesId] = useState(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [filters, setFilters] = useState({
    showAvailable: true,
    date: '',
    location: '',
    distance: '',
    status: ''
  });
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuEventId, setMenuEventId] = useState(null);

  const handleMenuOpen = (event, eventId) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuEventId(eventId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuEventId(null);
  };

  const refreshEvents = async () => {
    try {
      const events = await getEventsByStatus('Highlight');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const transformedEvents = events
        .filter(event => {
          const eventDate = new Date(event.date);
          return eventDate < today;
        })
        .map(event => {
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
            parent_event_id: event.parent_event_id
          };
        }).sort((a, b) => b.date.localeCompare(a.date));
      setPastEvents(transformedEvents);
    } catch (error) {
      console.error('Error refreshing events:', error);
    }
  };

  const handleToggleSeriesParent = async () => {
    if (!menuEventId || !currentUser?.uid) return;
    try {
      const result = await toggleSeriesParent(menuEventId, currentUser.uid);
      setSnackbarMessage(result.message);
      await refreshEvents();
    } catch (error) {
      console.error('Error toggling series parent:', error);
      setSnackbarMessage('Failed to update event');
    }
    handleMenuClose();
  };

  const handleSeriesUpdated = async (message) => {
    setSnackbarMessage(message || 'Series updated');
    await refreshEvents();
  };

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = '/images/2025/20250517_bk_half.jpg';
  };

  useEffect(() => {
    // Fetch events from API
    const fetchEvents = async () => {
      try {
        const events = await getEventsByStatus('Highlight');
        console.log('Fetched highlight events from API:', events);

        // Get today's date for filtering past events
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Transform API response to match expected format and filter for past events only
        const transformedEvents = events
          .filter(event => {
            // Only include events that have already passed
            const eventDate = new Date(event.date);
            return eventDate < today;
          })
          .map(event => {
            // Parse the event date and time for filtering
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
              parent_event_id: event.parent_event_id
            };
          }).sort((a, b) => b.date.localeCompare(a.date)); // Sort in reverse chronological order

        console.log('Transformed highlight events:', transformedEvents);

        // Set past events
        setPastEvents(transformedEvents);

        // Set featured events (first 3 events)
        const featured = transformedEvents.slice(0, 3).map(event => {
          console.log('Creating featured event:', event.name, 'with image:', event.image);
          return {
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
          };
        });
        console.log('Featured events:', featured);
        setFeaturedEvents(featured);

        // Fetch engagement data for all events
        if (transformedEvents.length > 0) {
          try {
            const eventIds = transformedEvents.map(e => e.id);
            const batchResult = await getBatchEngagement(eventIds, currentUser?.uid);
            setEngagementData(batchResult.engagements || {});
          } catch (engagementError) {
            console.error('Error fetching engagement data:', engagementError);
          }
        }
      } catch (error) {
        console.error('Error loading events:', error);
      }
    };

    fetchEvents();
  }, [currentUser?.uid]);

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
          Featured Highlights
          <br />
          精选回顾
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
                <CardMedia
                  component="img"
                  height="200"
                  image={event.image}
                  alt={event.title}
                  onError={handleImageError}
                  sx={{
                    objectFit: 'cover',
                    backgroundColor: '#f5f5f5'
                  }}
                />
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography gutterBottom variant="h6" component="div">
                    {event.title}
                  </Typography>
                  <Typography gutterBottom variant="subtitle1" color="text.secondary">
                    {event.chineseTitle}
                  </Typography>
                  <EventGalleryPreview eventId={event.id} maxImages={4} size={40} />
                  <EventEngagementBar
                    eventId={event.id}
                    initialData={engagementData[event.id]}
                  />
                  <Button
                    variant="contained"
                    sx={{
                      mt: 2,
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
          Past Events
          <br />
          历史活动
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

        {/* Events List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filteredEvents.map((event) => (
            // Render EventSeriesCard for recurring events, regular card for others
            event.is_recurring || event.parent_event_id ? (
              <EventSeriesCard
                key={event.id}
                event={event}
                isExpanded={expandedSeriesId === event.id}
                onToggleExpand={() => setExpandedSeriesId(
                  expandedSeriesId === event.id ? null : event.id
                )}
                onEventClick={handleEventClick}
                engagementData={engagementData[event.id]}
                adminModeEnabled={adminModeEnabled}
                onSeriesUpdated={handleSeriesUpdated}
              />
            ) : (
              <Card
                key={event.id}
                draggable={adminModeEnabled}
                onDragStart={(e) => {
                  e.dataTransfer.setData('eventId', String(event.id));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  height: { xs: 'auto', sm: '200px' },
                  overflow: 'hidden',
                  cursor: adminModeEnabled ? 'grab' : 'pointer',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    transition: 'transform 0.3s ease-in-out',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
                  },
                  '&:active': adminModeEnabled ? { cursor: 'grabbing' } : {}
                }}
                onClick={() => handleEventClick(event)}
              >
                {/* Mobile: Image at top */}
                <Box
                  sx={{
                    display: { xs: 'block', sm: 'none' },
                    width: '100%',
                    height: '150px'
                  }}
                >
                  <CardMedia
                    component="img"
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
                    whiteSpace: 'nowrap'
                  }}
                >
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
                  {/* Admin menu button */}
                  {adminModeEnabled && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, event.id)}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': { backgroundColor: 'rgba(255, 165, 0, 0.2)' }
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  )}
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
            )
          ))}
        </Box>
      </Container>

      {/* Snackbar for notifications */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage('')}
        message={snackbarMessage}
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
      </Menu>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </Box>
  );
} 