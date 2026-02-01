import React, { useState } from 'react';
import {
  Box,
  Card,
  CardMedia,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import EventGalleryPreview from './EventGalleryPreview';

/**
 * EventGroupGalleryModal - Full-screen modal showing all events in a group
 * Displays events in a grid with year badges
 * Admin mode allows right-click to remove events from group
 */
const EventGroupGalleryModal = ({
  open,
  onClose,
  group,
  onEventClick,
  onRemoveFromGroup,
  adminModeEnabled = false,
}) => {
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  if (!group) return null;

  const handleImageError = (e) => {
    e.target.src = '/images/2025/20250517_bk_half.jpg';
  };

  const handleContextMenu = (event, eventData) => {
    if (!adminModeEnabled) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedEvent(eventData);
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setSelectedEvent(null);
  };

  const handleRemoveFromGroup = () => {
    if (selectedEvent && onRemoveFromGroup) {
      onRemoveFromGroup(selectedEvent.id);
    }
    handleCloseContextMenu();
  };

  const getYear = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).getFullYear();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Events are already sorted in reverse chronological order from the API
  const events = group.events || [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          maxHeight: '90vh',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2,
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#fafafa',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#333' }}>
            {group.group_name}
          </Typography>
          {group.group_name_cn && (
            <Typography variant="subtitle1" color="text.secondary">
              {group.group_name_cn}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {group.event_count} events
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#666' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {events.map((event) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={event.id}>
              <Card
                sx={{
                  cursor: 'pointer',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    transition: 'transform 0.2s ease-in-out',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  },
                }}
                onClick={() => onEventClick(event)}
                onContextMenu={(e) => handleContextMenu(e, event)}
              >
                {/* Image with year badge */}
                <Box sx={{ position: 'relative' }}>
                  <CardMedia
                    component="img"
                    height="140"
                    image={event.image || '/images/2025/20250517_bk_half.jpg'}
                    alt={event.name}
                    onError={handleImageError}
                    sx={{
                      objectFit: 'cover',
                      backgroundColor: '#f5f5f5',
                    }}
                  />
                  <Chip
                    label={getYear(event.date)}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  />
                  {/* Admin remove button */}
                  {adminModeEnabled && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                        if (onRemoveFromGroup) {
                          onRemoveFromGroup(event.id);
                        }
                      }}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        color: '#d32f2f',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 1)',
                        },
                      }}
                    >
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>

                <CardContent sx={{ flexGrow: 1, p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
                    {event.name}
                  </Typography>
                  {event.chinese_name && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {event.chinese_name}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatDate(event.date)}
                  </Typography>
                  {event.location && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {event.location}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1 }}>
                    <EventGalleryPreview eventId={event.id} maxImages={4} size={32} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Admin hint */}
        {adminModeEnabled && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'center', mt: 3 }}
          >
            Right-click or tap the remove button to remove events from this group
          </Typography>
        )}
      </DialogContent>

      {/* Context Menu for remove */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleRemoveFromGroup}>
          <RemoveCircleOutlineIcon sx={{ mr: 1, color: '#d32f2f' }} />
          Remove from Group
        </MenuItem>
      </Menu>
    </Dialog>
  );
};

export default EventGroupGalleryModal;
