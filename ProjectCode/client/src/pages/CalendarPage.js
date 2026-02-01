import FilterListIcon from '@mui/icons-material/FilterList';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EventIcon from '@mui/icons-material/Event';
import { Alert, Box, Button, Card, CardContent, CardMedia, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem, Snackbar, Switch, TextField, Tooltip, Typography } from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import { useEffect, useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import DOMPurify from 'dompurify';
import NavigationButtons from '../components/NavigationButtons';
import { useAdmin, useAuth } from '../context';
import { useAutoFillOnTab, useTranslationAutoFill } from '../hooks';
import { storage } from '../firebase/config';
import { getEventsByStatus, createEvent, updateEvent, deleteEvent } from '../api';

const initialFormData = {
  name: '',
  chinese_name: '',
  date: '',
  time: '',
  location: '',
  chinese_location: '',
  description: '',
  chinese_description: '',
  image: '',
  signup_link: '',
  status: 'Upcoming',
  event_type: 'standard',
  heylo_embed: '',
  // Recurrence fields
  is_recurring: false,
  recurrence_type: 'weekly',
  days_of_week: '',
  day_of_month: '',
  week_of_month: '',
  month_of_year: '',
  recurrence_end_date: ''
};

export default function CalendarPage() {
  const { adminModeEnabled } = useAdmin();
  const { currentUser } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [filters, setFilters] = useState({
    showAvailable: true,
    date: '',
    location: '',
    distance: '',
    status: ''
  });

  // Admin event management state
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [editingEventId, setEditingEventId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Image upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // Default values for Tab auto-fill
  const eventDefaultValues = {
    name: 'New Event',
    chinese_name: '新活动',
    time: '8:00 AM',
    location: 'Central Park',
    chinese_location: '中央公园',
    description: 'Event description goes here.',
    chinese_description: '活动描述在此。',
    signup_link: 'https://newbeerunningclub.org/signup'
  };

  const handleAutoFill = useAutoFillOnTab({
    setValue: (field, value) => setFormData(prev => ({ ...prev, [field]: value })),
    defaultValues: eventDefaultValues
  });

  // Translation auto-fill for bilingual fields
  const {
    handleKeyDown: handleTranslationKeyDown,
    handleBlur: handleTranslationBlur,
    translations,
    isTranslating
  } = useTranslationAutoFill({
    setValue: (field, value) => setFormData(prev => ({ ...prev, [field]: value })),
    getValue: (field) => formData[field],
    fieldPairs: [
      ['name', 'chinese_name'],
      ['location', 'chinese_location'],
      ['description', 'chinese_description']
    ]
  });

  // Combined key down handler for both auto-fill and translation
  const handleFieldKeyDown = (event) => {
    handleAutoFill(event);
    handleTranslationKeyDown(event);
  };

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = '/images/placeholder-event.jpg';
  };

  useEffect(() => {
    // Fetch events from API
    const fetchEvents = async () => {
      try {
        const events = await getEventsByStatus('Upcoming');
        console.log('Fetched events from API:', events);

        // Get current year
        const currentYear = new Date().getFullYear();

        // Transform API response to match expected format and filter for current year
        const transformedEvents = events
          .filter(event => {
            // Only include events from the current year
            const eventYear = parseInt(event.date.split('-')[0], 10);
            return eventYear === currentYear;
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
              image: event.image,
              signupLink: event.signup_link,
              status: event.status,
              eventType: event.event_type || 'standard',
              heyloEmbed: event.heylo_embed || '',
              parsedDate: eventDate
            };
          }).sort((a, b) => a.date.localeCompare(b.date)); // Sort in chronological order

        console.log('Transformed upcoming events:', transformedEvents);

        // Set upcoming events
        setUpcomingEvents(transformedEvents);

        // Set featured events (first 3 events)
        setFeaturedEvents(transformedEvents.slice(0, 3).map(event => ({
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
        })));
      } catch (error) {
        console.error('Error loading events:', error);
      }
    };

    fetchEvents();
  }, []);

  const handleEventClick = (event) => {
    // For featured events, we need to find the full event data
    if (event.id) {
      setSelectedEvent(event);
    } else {
      // For upcoming events, we already have the full event data
      setSelectedEvent(event);
    }
  };

  const handleFilterChange = (field) => (event) => {
    setFilters({
      ...filters,
      [field]: event.target.value
    });
  };

  const handleEditEvent = (e, event) => {
    e.stopPropagation();
    // Pre-fill form with event data
    setFormData({
      name: event.name || event.title || '',
      chinese_name: event.chineseName || event.chineseTitle || '',
      date: event.date || '',
      time: event.time || '',
      location: event.location || '',
      chinese_location: event.chineseLocation || '',
      description: event.description || '',
      chinese_description: event.chineseDescription || '',
      image: event.image || '',
      signup_link: event.signupLink || '',
      status: event.status || 'Upcoming',
      event_type: event.eventType || event.event_type || 'standard',
      heylo_embed: event.heyloEmbed || event.heylo_embed || ''
    });
    setEditingEventId(event.id);
    setImageFile(null);
    setImagePreview(event.image || '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setEventFormOpen(true);
  };

  const handleDeleteEvent = (e, event) => {
    e.stopPropagation();
    setEventToDelete(event);
    setDeleteDialogOpen(true);
  };

  const handleAddEvent = () => {
    setFormData(initialFormData);
    setEditingEventId(null);
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setEventFormOpen(true);
  };

  const handleFormChange = (field) => (e) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleFormSubmit = async () => {
    // Validate required fields
    if (!formData.name || !formData.date) {
      setSnackbar({ open: true, message: 'Name and date are required / 名称和日期为必填项', severity: 'error' });
      return;
    }

    if (!currentUser?.uid) {
      setSnackbar({ open: true, message: 'You must be logged in to manage events / 您必须登录才能管理活动', severity: 'error' });
      return;
    }

    setLoading(true);
    try {
      // Upload image if a new file was selected
      let imageUrl = formData.image;
      if (imageFile) {
        imageUrl = await handleImageUpload();
      }

      const eventData = { ...formData, image: imageUrl };

      // Convert empty strings to null for backend validation
      const cleanedEventData = Object.fromEntries(
        Object.entries(eventData).map(([key, value]) => [key, value === '' ? null : value])
      );

      if (editingEventId) {
        // Update existing event
        await updateEvent(editingEventId, cleanedEventData, currentUser.uid);
        setSnackbar({ open: true, message: 'Event updated successfully / 活动已更新', severity: 'success' });
      } else {
        // Create new event
        await createEvent(cleanedEventData, currentUser.uid);
        setSnackbar({ open: true, message: 'Event created successfully / 活动已创建', severity: 'success' });
      }
      setEventFormOpen(false);
      setFormData(initialFormData);
      setEditingEventId(null);
      setImageFile(null);
      setImagePreview('');
      // Refresh events
      const events = await getEventsByStatus('Upcoming');
      const transformedEvents = events.map(event => ({
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
        signupLink: event.signup_link,
        status: event.status,
        eventType: event.event_type || 'standard',
        heyloEmbed: event.heylo_embed || ''
      })).sort((a, b) => a.date.localeCompare(b.date));
      setUpcomingEvents(transformedEvents);
      setFeaturedEvents(transformedEvents.slice(0, 3).map(event => ({
        id: event.id,
        title: event.name,
        chineseTitle: event.chineseName,
        image: event.image,
        description: event.description,
        date: event.date,
        time: event.time,
        location: event.location,
        chineseLocation: event.chineseLocation,
        chineseDescription: event.chineseDescription,
        eventType: event.eventType,
        heyloEmbed: event.heyloEmbed
      })));
    } catch (error) {
      console.error('Error saving event:', error);
      setSnackbar({ open: true, message: `Error: ${error.message || 'Failed to save event'}`, severity: 'error' });
    } finally {
      setLoading(false);
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
      // Refresh events
      const events = await getEventsByStatus('Upcoming');
      const transformedEvents = events.map(event => ({
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
        signupLink: event.signup_link,
        status: event.status,
        eventType: event.event_type || 'standard',
        heyloEmbed: event.heylo_embed || ''
      })).sort((a, b) => a.date.localeCompare(b.date));
      setUpcomingEvents(transformedEvents);
      setFeaturedEvents(transformedEvents.slice(0, 3).map(event => ({
        id: event.id,
        title: event.name,
        chineseTitle: event.chineseName,
        image: event.image,
        description: event.description,
        date: event.date,
        time: event.time,
        location: event.location,
        chineseLocation: event.chineseLocation,
        chineseDescription: event.chineseDescription,
        eventType: event.eventType,
        heyloEmbed: event.heyloEmbed
      })));
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

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setSnackbar({ open: true, message: 'Please select an image file / 请选择图片文件', severity: 'error' });
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setSnackbar({ open: true, message: 'Image must be less than 5MB / 图片必须小于5MB', severity: 'error' });
        return;
      }
      setImageFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const handleImageUpload = async () => {
    if (!imageFile) return formData.image;

    setUploadingImage(true);
    try {
      // Create a unique filename
      const timestamp = Date.now();
      const filename = `events/${timestamp}_${imageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, filename);

      // Upload the file
      await uploadBytes(storageRef, imageFile);

      // Get the download URL
      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('Failed to upload image / 图片上传失败');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setFormData(prev => ({ ...prev, image: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter events based on selected filters
  const filteredEvents = upcomingEvents.filter(event => {
    if (filters.date) {
      const referenceDate = new Date(2025, 4, 16); // May 16, 2025
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

      {/* Admin Mode Alert */}
      {adminModeEnabled && (
        <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
          <Alert
            severity="info"
            icon={<InfoIcon />}
          >
            Admin mode enabled. You can add, edit, and delete events. / 管理员模式已开启，您可以添加、编辑和删除活动。
          </Alert>
        </Container>
      )}

      {/* Upcoming Events Section */}
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
          Upcoming Events
          <br />
          即将举行的活动
        </Typography>

        {adminModeEnabled && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddEvent}
              sx={{
                backgroundColor: '#FFB84D',
                color: 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#FFA833',
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
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  position: 'relative',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    transition: 'transform 0.3s ease-in-out'
                  }
                }}
                onClick={() => handleEventClick(event)}
              >
                {/* Admin Edit/Delete Buttons */}
                {adminModeEnabled && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      zIndex: 10,
                      display: 'flex',
                      gap: 0.5
                    }}
                  >
                    <Tooltip title="Edit event / 编辑活动">
                      <IconButton
                        size="small"
                        onClick={(e) => handleEditEvent(e, event)}
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          '&:hover': { backgroundColor: 'white' }
                        }}
                      >
                        <EditIcon fontSize="small" color="primary" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete event / 删除活动">
                      <IconButton
                        size="small"
                        onClick={(e) => handleDeleteEvent(e, event)}
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          '&:hover': { backgroundColor: 'white' }
                        }}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
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
                  <Typography variant="body2" color="text.secondary" sx={{
                    mb: 2,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    flexGrow: 1
                  }}>
                    {event.description}
                  </Typography>
                  <Button
                    variant="contained"
                    sx={{
                      backgroundColor: '#FFB84D',
                      color: 'white',
                      textTransform: 'none',
                      fontSize: '16px',
                      px: 2,
                      py: 1.5,
                      borderRadius: '12px',
                      border: '2px solid #FFB84D',
                      mt: 2,
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
                    Learn More & Sign Up 了解更多并报名
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Event Calendar Section */}
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
          Upcoming
          <br />
          即将到来
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
              <MenuItem value="this-week">This Week</MenuItem>
              <MenuItem value="this-month">This Month</MenuItem>
              <MenuItem value="next-month">Next Month</MenuItem>
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
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
              <MenuItem value="upcoming">Upcoming</MenuItem>
            </TextField>
          </Grid>
          </Grid>
        </Box>

        {/* Events List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filteredEvents.map((event) => (
            <Card
              key={event.id}
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                height: { xs: 'auto', sm: '200px' },
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'transform 0.3s ease-in-out',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
                }
              }}
              onClick={() => handleEventClick(event)}
            >
              {/* Admin Edit/Delete Buttons for list view */}
              {adminModeEnabled && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    display: 'flex',
                    gap: 0.5
                  }}
                >
                  <Tooltip title="Edit event / 编辑活动">
                    <IconButton
                      size="small"
                      onClick={(e) => handleEditEvent(e, event)}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': { backgroundColor: 'white' }
                      }}
                    >
                      <EditIcon fontSize="small" color="primary" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete event / 删除活动">
                    <IconButton
                      size="small"
                      onClick={(e) => handleDeleteEvent(e, event)}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': { backgroundColor: 'white' }
                      }}
                    >
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}

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
                  flexDirection: 'column'
                }}
              >
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
                    Learn More & Sign Up 了解更多并报名
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.location}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.chineseLocation}
                </Typography>
              </Box>
            </Card>
          ))}
        </Box>
      </Container>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <Card
            sx={{
              maxWidth: 600,
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CardMedia
              component="img"
              height="300"
              image={selectedEvent.image}
              alt={selectedEvent.name || selectedEvent.title}
              onError={handleImageError}
              sx={{
                objectFit: 'cover',
                backgroundColor: '#f5f5f5'
              }}
            />
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="h5" sx={{ flexGrow: 1 }}>
                  {selectedEvent.name || selectedEvent.title}
                </Typography>
                {(selectedEvent.eventType || selectedEvent.event_type) === 'heylo' && (
                  <Chip
                    icon={<EventIcon />}
                    label="Heylo Event"
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
                {(selectedEvent.eventType || selectedEvent.event_type) === 'race' && (
                  <Chip
                    label="Race"
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                )}
              </Box>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                {selectedEvent.chineseName || selectedEvent.chineseTitle}
              </Typography>

              {/* Heylo Embed Display */}
              {(selectedEvent.eventType || selectedEvent.event_type) === 'heylo' && (selectedEvent.heyloEmbed || selectedEvent.heylo_embed) && (
                <Box
                  sx={{
                    my: 2,
                    p: 2,
                    backgroundColor: '#f5f5f5',
                    borderRadius: 2,
                    border: '1px solid #e0e0e0'
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Heylo Event Details / Heylo活动详情
                  </Typography>
                  <Box
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(selectedEvent.heyloEmbed || selectedEvent.heylo_embed, {
                        ADD_TAGS: ['iframe'],
                        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
                      })
                    }}
                    sx={{
                      '& iframe': {
                        maxWidth: '100%',
                        borderRadius: 1
                      }
                    }}
                  />
                </Box>
              )}

              <Typography variant="body1" paragraph>
                {selectedEvent.description}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Date: {selectedEvent.date}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Time: {selectedEvent.time}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Location: {selectedEvent.location}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                {selectedEvent.chineseLocation}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: '#FFB84D',
                    color: 'white',
                    textTransform: 'none',
                    fontSize: '16px',
                    px: 2,
                    py: 1.5,
                    borderRadius: '12px',
                    border: '2px solid #FFB84D',
                    mr: 2,
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
                  Sign Up 报名
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setSelectedEvent(null)}
                  sx={{
                    color: '#FFB84D',
                    borderColor: '#FFB84D',
                    textTransform: 'none',
                    fontSize: '16px',
                    px: 2,
                    py: 1.5,
                    borderRadius: '12px',
                    '&:hover': {
                      borderColor: '#FFA833',
                      backgroundColor: 'rgba(255, 184, 77, 0.04)',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                      transform: 'translateY(-2px)',
                    },
                    '&:active': {
                      transform: 'translateY(1px) scale(0.98)',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    }
                  }}
                >
                  Close 关闭
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Event Form Dialog */}
      <Dialog open={eventFormOpen} onClose={() => setEventFormOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingEventId ? 'Edit Event / 编辑活动' : 'Add Event / 添加活动'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              name="name"
              label="Event Name / 活动名称 *"
              value={formData.name}
              onChange={handleFormChange('name')}
              onKeyDown={handleFieldKeyDown}
              onBlur={handleTranslationBlur}
              placeholder={eventDefaultValues.name}
              fullWidth
              required
            />
            <TextField
              name="chinese_name"
              label="Chinese Name / 中文名称"
              value={formData.chinese_name}
              onChange={handleFormChange('chinese_name')}
              onKeyDown={handleFieldKeyDown}
              onBlur={handleTranslationBlur}
              placeholder={translations.chinese_name || eventDefaultValues.chinese_name}
              fullWidth
              InputProps={{
                endAdornment: isTranslating && !formData.chinese_name && (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                )
              }}
              helperText={translations.chinese_name && !formData.chinese_name ? 'Press Tab to auto-fill translation' : ''}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Date / 日期 *"
                type="date"
                value={formData.date}
                onChange={handleFormChange('date')}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                name="time"
                label="Time / 时间"
                value={formData.time}
                onChange={handleFormChange('time')}
                onKeyDown={handleFieldKeyDown}
                fullWidth
                placeholder={eventDefaultValues.time}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                name="location"
                label="Location / 地点"
                value={formData.location}
                onChange={handleFormChange('location')}
                onKeyDown={handleFieldKeyDown}
                onBlur={handleTranslationBlur}
                placeholder={eventDefaultValues.location}
                fullWidth
              />
              <TextField
                name="chinese_location"
                label="Chinese Location / 中文地点"
                value={formData.chinese_location}
                onChange={handleFormChange('chinese_location')}
                onKeyDown={handleFieldKeyDown}
                onBlur={handleTranslationBlur}
                placeholder={translations.chinese_location || eventDefaultValues.chinese_location}
                fullWidth
                InputProps={{
                  endAdornment: isTranslating && !formData.chinese_location && (
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                  )
                }}
                helperText={translations.chinese_location && !formData.chinese_location ? 'Press Tab to auto-fill translation' : ''}
              />
            </Box>
            <TextField
              name="description"
              label="Description / 描述"
              value={formData.description}
              onChange={handleFormChange('description')}
              onKeyDown={handleFieldKeyDown}
              onBlur={handleTranslationBlur}
              placeholder={eventDefaultValues.description}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              name="chinese_description"
              label="Chinese Description / 中文描述"
              value={formData.chinese_description}
              onChange={handleFormChange('chinese_description')}
              onKeyDown={handleFieldKeyDown}
              onBlur={handleTranslationBlur}
              placeholder={translations.chinese_description || eventDefaultValues.chinese_description}
              fullWidth
              multiline
              rows={3}
              InputProps={{
                endAdornment: isTranslating && !formData.chinese_description && (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                )
              }}
              helperText={translations.chinese_description && !formData.chinese_description ? 'Press Tab to auto-fill translation' : ''}
            />
            {/* Image Upload */}
            <Box sx={{ border: '1px dashed #ccc', borderRadius: 1, p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Event Image / 活动图片
              </Typography>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                ref={fileInputRef}
                style={{ display: 'none' }}
                id="event-image-upload"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <label htmlFor="event-image-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={uploadingImage ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                    disabled={uploadingImage}
                    sx={{
                      borderColor: '#FFB84D',
                      color: '#FFB84D',
                      '&:hover': { borderColor: '#FFA833', backgroundColor: 'rgba(255, 184, 77, 0.04)' }
                    }}
                  >
                    {uploadingImage ? 'Uploading...' : 'Choose Image / 选择图片'}
                  </Button>
                </label>
                {(imagePreview || formData.image) && (
                  <Button
                    variant="text"
                    color="error"
                    size="small"
                    onClick={handleRemoveImage}
                  >
                    Remove / 移除
                  </Button>
                )}
              </Box>
              {(imagePreview || formData.image) && (
                <Box sx={{ mt: 2 }}>
                  <img
                    src={imagePreview || formData.image}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      borderRadius: 4,
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </Box>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Max size: 5MB. Supported: JPG, PNG, GIF / 最大5MB，支持JPG、PNG、GIF格式
              </Typography>
            </Box>
            <TextField
              name="signup_link"
              label="Signup Link / 报名链接"
              value={formData.signup_link}
              onChange={handleFormChange('signup_link')}
              onKeyDown={handleFieldKeyDown}
              fullWidth
              placeholder={eventDefaultValues.signup_link}
            />
            <TextField
              select
              label="Status / 状态 *"
              value={formData.status}
              onChange={handleFormChange('status')}
              fullWidth
              required
            >
              <MenuItem value="Upcoming">Upcoming / 即将举行</MenuItem>
              <MenuItem value="Highlight">Highlight / 精选</MenuItem>
              <MenuItem value="Cancelled">Cancelled / 已取消</MenuItem>
            </TextField>
            <TextField
              select
              label="Event Type / 活动类型"
              value={formData.event_type}
              onChange={handleFormChange('event_type')}
              fullWidth
            >
              <MenuItem value="standard">Standard / 标准</MenuItem>
              <MenuItem value="heylo">Heylo (Weekly Run) / Heylo周跑</MenuItem>
              <MenuItem value="race">Race / 比赛</MenuItem>
            </TextField>
            {formData.event_type === 'heylo' && (
              <TextField
                label="Heylo Embed Code / Heylo嵌入代码"
                value={formData.heylo_embed}
                onChange={handleFormChange('heylo_embed')}
                fullWidth
                multiline
                rows={4}
                placeholder="Paste Heylo embed code here... / 在此粘贴Heylo嵌入代码..."
                helperText="Paste the embed code from Heylo Pro admin panel. The event details will auto-display. / 从Heylo Pro管理面板粘贴嵌入代码，活动详情将自动显示。"
              />
            )}

            {/* Recurrence Section */}
            <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <RepeatIcon color="action" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Recurring Event / 重复活动
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                  />
                }
                label="Enable recurrence / 启用重复"
              />

              {formData.is_recurring && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                  <TextField
                    select
                    label="Recurrence Type / 重复类型"
                    value={formData.recurrence_type}
                    onChange={handleFormChange('recurrence_type')}
                    fullWidth
                  >
                    <MenuItem value="weekly">Weekly / 每周</MenuItem>
                    <MenuItem value="biweekly">Biweekly / 每两周</MenuItem>
                    <MenuItem value="monthly">Monthly / 每月</MenuItem>
                    <MenuItem value="yearly">Yearly / 每年</MenuItem>
                    <MenuItem value="custom">Custom / 自定义</MenuItem>
                  </TextField>

                  {/* Days of Week selector for weekly/biweekly */}
                  {(formData.recurrence_type === 'weekly' || formData.recurrence_type === 'biweekly') && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Days of Week / 每周哪几天
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
                          const days = formData.days_of_week ? formData.days_of_week.split(',').map(Number) : [];
                          const isSelected = days.includes(index);
                          return (
                            <Chip
                              key={day}
                              label={day}
                              size="small"
                              color={isSelected ? 'primary' : 'default'}
                              onClick={() => {
                                let newDays;
                                if (isSelected) {
                                  newDays = days.filter(d => d !== index);
                                } else {
                                  newDays = [...days, index].sort();
                                }
                                setFormData({ ...formData, days_of_week: newDays.join(',') });
                              }}
                              sx={{ cursor: 'pointer' }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  {/* Day of Month selector for monthly */}
                  {formData.recurrence_type === 'monthly' && (
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField
                        type="number"
                        label="Day of Month / 每月几号"
                        value={formData.day_of_month}
                        onChange={handleFormChange('day_of_month')}
                        inputProps={{ min: 1, max: 31 }}
                        sx={{ flex: 1 }}
                        helperText="1-31 (or leave empty for week-based)"
                      />
                      <TextField
                        select
                        label="Week of Month / 每月第几周"
                        value={formData.week_of_month}
                        onChange={handleFormChange('week_of_month')}
                        sx={{ flex: 1 }}
                      >
                        <MenuItem value="">None</MenuItem>
                        <MenuItem value="1">1st / 第一周</MenuItem>
                        <MenuItem value="2">2nd / 第二周</MenuItem>
                        <MenuItem value="3">3rd / 第三周</MenuItem>
                        <MenuItem value="4">4th / 第四周</MenuItem>
                        <MenuItem value="5">Last / 最后一周</MenuItem>
                      </TextField>
                    </Box>
                  )}

                  {/* Yearly recurrence: Month, Week, Day selectors */}
                  {formData.recurrence_type === 'yearly' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        select
                        label="Month / 月份"
                        value={formData.month_of_year}
                        onChange={handleFormChange('month_of_year')}
                        fullWidth
                      >
                        <MenuItem value="1">January / 一月</MenuItem>
                        <MenuItem value="2">February / 二月</MenuItem>
                        <MenuItem value="3">March / 三月</MenuItem>
                        <MenuItem value="4">April / 四月</MenuItem>
                        <MenuItem value="5">May / 五月</MenuItem>
                        <MenuItem value="6">June / 六月</MenuItem>
                        <MenuItem value="7">July / 七月</MenuItem>
                        <MenuItem value="8">August / 八月</MenuItem>
                        <MenuItem value="9">September / 九月</MenuItem>
                        <MenuItem value="10">October / 十月</MenuItem>
                        <MenuItem value="11">November / 十一月</MenuItem>
                        <MenuItem value="12">December / 十二月</MenuItem>
                      </TextField>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                          select
                          label="Week / 第几周"
                          value={formData.week_of_month}
                          onChange={handleFormChange('week_of_month')}
                          sx={{ flex: 1 }}
                        >
                          <MenuItem value="1">1st / 第一</MenuItem>
                          <MenuItem value="2">2nd / 第二</MenuItem>
                          <MenuItem value="3">3rd / 第三</MenuItem>
                          <MenuItem value="4">4th / 第四</MenuItem>
                          <MenuItem value="5">Last / 最后</MenuItem>
                        </TextField>
                        <TextField
                          select
                          label="Day / 星期几"
                          value={formData.days_of_week}
                          onChange={handleFormChange('days_of_week')}
                          sx={{ flex: 1 }}
                        >
                          <MenuItem value="0">Sunday / 周日</MenuItem>
                          <MenuItem value="1">Monday / 周一</MenuItem>
                          <MenuItem value="2">Tuesday / 周二</MenuItem>
                          <MenuItem value="3">Wednesday / 周三</MenuItem>
                          <MenuItem value="4">Thursday / 周四</MenuItem>
                          <MenuItem value="5">Friday / 周五</MenuItem>
                          <MenuItem value="6">Saturday / 周六</MenuItem>
                        </TextField>
                      </Box>
                    </Box>
                  )}

                  <TextField
                    type="date"
                    label="End Date (optional) / 结束日期"
                    value={formData.recurrence_end_date}
                    onChange={handleFormChange('recurrence_end_date')}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Leave empty for no end date / 留空表示无结束日期"
                  />
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEventFormOpen(false)} disabled={loading}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleFormSubmit}
            disabled={loading}
            sx={{
              backgroundColor: '#FFB84D',
              '&:hover': { backgroundColor: '#FFA833' }
            }}
          >
            {loading ? <CircularProgress size={24} /> : (editingEventId ? 'Update / 更新' : 'Create / 创建')}
          </Button>
        </DialogActions>
      </Dialog>

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
