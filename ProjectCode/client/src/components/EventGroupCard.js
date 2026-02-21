import React from 'react';
import {
  Box,
  Card,
  CardMedia,
  Chip,
  Typography,
  Button,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import EventGalleryPreview from './EventGalleryPreview';
import EventEngagementBar from './EventEngagementBar';

/**
 * EventGroupCard - iOS-style stacked card for event groups
 * Shows a stacked card effect with a badge showing event count
 * Clicking opens the gallery modal to view all events in the group
 */
const EventGroupCard = ({
  group,
  onGroupClick,
  engagementData,
  adminModeEnabled = false,
}) => {
  const handleImageError = (e) => {
    e.target.src = '/images/2025/20250517_bk_half.jpg';
  };

  const eventCount = group.event_count;

  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        minHeight: { xs: 'auto', sm: '200px' },
        overflow: 'visible',
        cursor: 'pointer',
        position: 'relative',
        // Stacked card effect
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '4px',
          left: '4px',
          right: '-4px',
          bottom: '-4px',
          backgroundColor: '#e8e8e8',
          borderRadius: '8px',
          zIndex: -1,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '8px',
          left: '8px',
          right: '-8px',
          bottom: '-8px',
          backgroundColor: '#d8d8d8',
          borderRadius: '8px',
          zIndex: -2,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        },
        '&:hover': {
          transform: 'translateY(-2px)',
          transition: 'transform 0.3s ease-in-out',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        },
      }}
      onClick={() => onGroupClick(group)}
    >
      {/* Mobile: Image at top */}
      <Box
        sx={{
          display: { xs: 'block', sm: 'none' },
          width: '100%',
          height: '150px',
          position: 'relative',
        }}
      >
        <CardMedia
          component="img"
          sx={{
            height: '100%',
            width: '100%',
            objectFit: 'cover',
            backgroundColor: '#f5f5f5',
          }}
          image={group.cover_image || '/images/2025/20250517_bk_half.jpg'}
          alt={group.group_name}
          onError={handleImageError}
        />
        {/* Group badge */}
        <Chip
          icon={<FolderIcon sx={{ fontSize: 16 }} />}
          label={`${eventCount} Events`}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            backgroundColor: 'rgba(255, 165, 0, 0.9)',
            color: 'white',
            fontWeight: 600,
          }}
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
          whiteSpace: 'nowrap',
          position: 'relative',
        }}
      >
        {/* Group badge for desktop */}
        <Chip
          icon={<FolderIcon sx={{ fontSize: 14 }} />}
          label={`${eventCount}`}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            backgroundColor: 'rgba(255, 165, 0, 0.9)',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          {new Date(group.most_recent_date).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric'
          })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          to present
        </Typography>
      </Box>

      {/* Image Column - hidden on mobile, shown on sm+ */}
      <Box
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: '200px',
          flexShrink: 0,
        }}
      >
        <CardMedia
          component="img"
          sx={{
            height: '100%',
            width: '100%',
            objectFit: 'cover',
            backgroundColor: '#f5f5f5',
          }}
          image={group.cover_image || '/images/2025/20250517_bk_half.jpg'}
          alt={group.group_name}
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
        }}
      >
        {/* Mobile: Show date and badge at top of content */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 2, mb: 1, color: '#FFA500' }}>
          <Typography variant="subtitle1" color="text.secondary">
            {new Date(group.most_recent_date).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric'
            })}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'flex-start' },
            mb: 1,
            gap: 1,
          }}
        >
          <Box>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              {group.group_name}
            </Typography>
            {group.group_name_cn && (
              <Typography
                variant="subtitle1"
                color="text.secondary"
                gutterBottom
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
              >
                {group.group_name_cn}
              </Typography>
            )}
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
            }}
          >
            View All {eventCount} Events
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {eventCount} events from {new Date(group.events[group.events.length - 1]?.date).getFullYear()} to {new Date(group.most_recent_date).getFullYear()}
        </Typography>

        {/* Gallery preview from most recent event */}
        <Box sx={{ mb: 1 }}>
          <EventGalleryPreview eventId={group.parent_event_id} maxImages={5} size={36} />
        </Box>

        {/* Engagement bar */}
        <EventEngagementBar
          eventId={group.parent_event_id}
          initialData={engagementData}
        />
      </Box>
    </Card>
  );
};

export default EventGroupCard;
