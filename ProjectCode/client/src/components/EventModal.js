import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useNavigate } from 'react-router-dom';

/**
 * EventModal - Dialog showing event details
 * Used when clicking on event-linked banners in the homepage carousel
 */
export default function EventModal({ open, onClose, event }) {
  const navigate = useNavigate();

  if (!event) return null;

  // Check if event is in the past
  const isPastEvent = () => {
    if (!event?.date && !event?.event_date) return false;
    const eventDateValue = new Date(event.date || event.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDateValue < today;
  };

  const handleSignUp = () => {
    if (event.event_signup_link || event.signup_link) {
      window.open(event.event_signup_link || event.signup_link, '_blank');
    }
  };

  const handleViewAllEvents = () => {
    onClose();
    navigate('/calendar');
  };

  const eventName = event.event_name || event.name;
  const eventChineseName = event.event_chinese_name || event.chinese_name;
  const eventDate = event.event_date || event.date;
  const eventTime = event.event_time || event.time;
  const eventLocation = event.event_location || event.location;
  const eventChineseLocation = event.event_chinese_location || event.chinese_location;
  const eventDescription = event.event_description || event.description;
  const eventChineseDescription = event.event_chinese_description || event.chinese_description;
  const eventImage = event.image_url || event.image;
  const eventImagePosition = event.image_position || 'center center';
  const signupLink = event.event_signup_link || event.signup_link;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: { xs: '12px', sm: '16px' },
          overflow: 'hidden',
        },
      }}
    >
      {/* Event Image */}
      {eventImage && (
        <Box
          sx={{
            width: '100%',
            height: { xs: '150px', sm: '250px', md: '300px' },
            position: 'relative',
          }}
        >
          <Box
            component="img"
            src={eventImage}
            alt={eventName}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: eventImagePosition,
            }}
            onError={(e) => {
              e.target.src = '/placeholder-event.png';
            }}
          />
          <IconButton
            onClick={onClose}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.5)',
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(0,0,0,0.7)',
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      )}

      <DialogTitle
        sx={{
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: '#FFA500',
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
            }}
          >
            {eventName}
          </Typography>
          {eventChineseName && (
            <Typography
              variant="subtitle1"
              sx={{
                color: 'text.secondary',
                fontSize: { xs: '1rem', sm: '1.125rem' },
              }}
            >
              {eventChineseName}
            </Typography>
          )}
        </Box>
        {!eventImage && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Event Details */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          {eventDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CalendarTodayIcon sx={{ color: '#FFA500', fontSize: '1.25rem' }} />
              <Typography variant="body1">
                {new Date(eventDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Typography>
            </Box>
          )}

          {eventTime && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AccessTimeIcon sx={{ color: '#FFA500', fontSize: '1.25rem' }} />
              <Typography variant="body1">{eventTime}</Typography>
            </Box>
          )}

          {(eventLocation || eventChineseLocation) && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <LocationOnIcon sx={{ color: '#FFA500', fontSize: '1.25rem', mt: 0.25 }} />
              <Box>
                {eventLocation && (
                  <Typography variant="body1">{eventLocation}</Typography>
                )}
                {eventChineseLocation && (
                  <Typography variant="body2" color="text.secondary">
                    {eventChineseLocation}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>

        {/* Event Description */}
        {(eventDescription || eventChineseDescription) && (
          <Box
            sx={{
              p: 2,
              backgroundColor: 'rgba(255, 165, 0, 0.05)',
              borderRadius: 2,
              border: '1px solid rgba(255, 165, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            {eventDescription && (
              <Typography
                variant="body1"
                sx={{
                  mb: eventChineseDescription ? 2 : 0,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {eventDescription}
              </Typography>
            )}
            {eventChineseDescription && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {eventChineseDescription}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={handleViewAllEvents} variant="outlined">
          View All Events
          <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem' }}>
            / 查看所有活动
          </Typography>
        </Button>
        {signupLink && !isPastEvent() && (
          <Button
            variant="contained"
            onClick={handleSignUp}
            sx={{
              backgroundColor: '#FFA500',
              '&:hover': { backgroundColor: '#FF8C00' },
            }}
          >
            Sign Up
            <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem' }}>
              / 报名
            </Typography>
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
