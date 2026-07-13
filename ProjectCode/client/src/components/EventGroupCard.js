import React, { useState } from 'react';
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
import ImagePositionEditor from './ImagePositionEditor';
import { updateEvent } from '../api';
import { useAuth } from '../context/AuthContext';
import { ORANGE, ORANGE_DARK, ORANGE_BG, LINE, CARD_HOVER_SHADOW, FALLBACK_EVENT_IMAGE } from '../theme/tokens';

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
  onPositionSaved,
}) => {
  const { currentUser } = useAuth();
  const [coverPosition, setCoverPosition] = useState(group.cover_image_position || 'center center');

  const handleImageError = (e) => {
    e.target.src = FALLBACK_EVENT_IMAGE;
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
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: CARD_HOVER_SHADOW,
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
        {adminModeEnabled && group.cover_image ? (
          <ImagePositionEditor
            imageUrl={group.cover_image}
            currentPosition={coverPosition}
            onSave={async (position) => {
              await updateEvent(group.cover_event_id || group.parent_event_id, { image_position: position }, currentUser.uid);
            }}
            onPositionSaved={(pos) => {
              setCoverPosition(pos);
              if (onPositionSaved) onPositionSaved(pos);
            }}
            sx={{ width: '100%', height: '100%' }}
          />
        ) : (
          <CardMedia
            component="img"
            loading="lazy"
            sx={{
              height: '100%',
              width: '100%',
              objectFit: 'cover',
              objectPosition: coverPosition,
              backgroundColor: ORANGE_BG,
            }}
            image={group.cover_image || FALLBACK_EVENT_IMAGE}
            alt={group.group_name}
            onError={handleImageError}
          />
        )}
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
            zIndex: 5,
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
          color: ORANGE,
          p: 2,
          borderRight: `1px solid ${LINE}`,
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
        {adminModeEnabled && group.cover_image ? (
          <ImagePositionEditor
            imageUrl={group.cover_image}
            currentPosition={coverPosition}
            onSave={async (position) => {
              await updateEvent(group.cover_event_id || group.parent_event_id, { image_position: position }, currentUser.uid);
            }}
            onPositionSaved={(pos) => {
              setCoverPosition(pos);
              if (onPositionSaved) onPositionSaved(pos);
            }}
            sx={{ width: '100%', height: '100%' }}
          />
        ) : (
          <CardMedia
            component="img"
            loading="lazy"
            sx={{
              height: '100%',
              width: '100%',
              objectFit: 'cover',
              objectPosition: coverPosition,
              backgroundColor: ORANGE_BG,
            }}
            image={group.cover_image || FALLBACK_EVENT_IMAGE}
            alt={group.group_name}
            onError={handleImageError}
          />
        )}
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
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 2, mb: 1, color: ORANGE }}>
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
            disableElevation
            sx={{
              backgroundColor: ORANGE,
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: { xs: '0.8125rem', sm: '0.9375rem' },
              px: { xs: 2, sm: 2.5 },
              py: { xs: 0.75, sm: 1 },
              borderRadius: '99px',
              flexShrink: 0,
              '&:hover': {
                backgroundColor: ORANGE_DARK,
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          >
            View All {eventCount} Events 查看全部
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
