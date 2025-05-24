import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, Card, CardContent, CardMedia, Container, Grid, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function CalendarPage() {
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

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = '/images/placeholder-event.jpg';
  };

  useEffect(() => {
    // Fetch and parse the CSV file
    fetch('/data/events.csv')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load events data');
        }
        return response.text();
      })
      .then(csvData => {
        Papa.parse(csvData, {
          header: true,
          complete: (results) => {
            // Set reference date to 2025-01-01
            const referenceDate = '2025-01-01';
            console.log('Reference date:', referenceDate);
            
            // Sort events by date and time, and filter for future events
            const sortedEvents = results.data
              .filter(event => event.id) // Remove empty rows
              .map(event => {
                // Parse the event date and time
                const [year, month, day] = event.date.split('-').map(Number);
                const [hours, minutes] = event.time.split(':').map(Number);
                const isPM = event.time.toLowerCase().includes('pm');
                const eventDate = new Date(year, month - 1, day, isPM ? hours + 12 : hours, minutes);
                console.log('Event:', event.name, 'Date:', event.date, 'Is future?', event.date > referenceDate);
                
                return {
                  ...event,
                  image: `/images/placeholder-event.jpg`, // Use correct path
                  parsedDate: eventDate
                };
              })
              .filter(event => event.date > referenceDate) // Filter future events using string comparison
              .sort((a, b) => a.date.localeCompare(b.date)); // Sort in chronological order
            
            console.log('Future events:', sortedEvents);
            
            // Set upcoming events
            setUpcomingEvents(sortedEvents);
            
            // Set featured events (first 3 events)
            setFeaturedEvents(sortedEvents.slice(0, 3).map(event => ({
              id: event.id,
              title: event.name,
              chineseTitle: event.chineseName,
              image: event.image,
              description: event.description,
              date: event.date
            })));
          },
          error: (error) => {
            console.error('Error parsing CSV:', error);
          }
        });
      })
      .catch(error => {
        console.error('Error loading events:', error);
      });
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
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Featured Events Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 3
          }}
        >
          Featured Events
          精选活动
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
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
                    Learn More
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Upcoming Events Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 6 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: '#FFA500'
            }}
          >
            Upcoming Events
            即将举行的活动
          </Typography>
          
          <IconButton 
            sx={{ 
              color: '#FFA500',
              '&:hover': {
                backgroundColor: 'rgba(255, 165, 0, 0.1)'
              }
            }}
          >
            <FilterListIcon />
          </IconButton>
        </Box>

        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
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

        {/* Events List */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {filteredEvents.map((event) => (
            <Card 
              key={event.id}
              sx={{ 
                display: 'flex',
                height: '200px',
                overflow: 'hidden',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'transform 0.3s ease-in-out',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
                }
              }}
              onClick={() => handleEventClick(event)}
            >
              {/* Time Column */}
              <Box
                sx={{
                  width: '120px',
                  display: 'flex',
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

              {/* Image Column */}
              <Box
                sx={{
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
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      {event.name}
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                      {event.chineseName}
                    </Typography>
                  </Box>
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
                    Learn More
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.location}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {event.chineseLocation}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {event.description}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {event.chineseDescription}
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
              <Typography variant="h5" gutterBottom>
                {selectedEvent.name || selectedEvent.title}
              </Typography>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                {selectedEvent.chineseName || selectedEvent.chineseTitle}
              </Typography>
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
                  Sign Up
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
                  Close
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
} 