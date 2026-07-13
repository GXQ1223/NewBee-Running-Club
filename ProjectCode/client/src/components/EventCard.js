import { Box, Button, Card, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlaceIcon from '@mui/icons-material/Place';
import RepeatIcon from '@mui/icons-material/Repeat';
import ShareIcon from '@mui/icons-material/Share';
import EventCardImage from './EventCardImage';
import EventEngagementBar from './EventEngagementBar';
import EventGalleryPreview from './EventGalleryPreview';
import {
  ORANGE, ORANGE_DARK, ORANGE_BG, LINE, MUTED,
  GREEN, GREEN_BG, RED, RED_BG, BLUE, BLUE_BG,
  CARD_SHADOW, CARD_HOVER_SHADOW, FALLBACK_EVENT_IMAGE,
} from '../theme/tokens';
import { parseBubbleDate } from '../helpers/eventDate';

// Normalize the three field-naming conventions that coexist in event data
// (API snake_case, page-cache camelCase, banner event_* prefixes) so every
// surface can hand its cached shape straight to the card.
export function normalizeEvent(event) {
  return {
    id: event.id,
    name: event.name || event.title || event.event_name || '',
    chineseName: event.chinese_name || event.chineseName || event.chineseTitle || '',
    date: event.date || event.event_date || '',
    time: event.time || event.event_time || '',
    location: event.location || event.event_location || '',
    chineseLocation: event.chinese_location || event.chineseLocation || '',
    description: event.description || event.event_description || '',
    image: event.image || event.image_url || event.event_image || '',
    imagePosition: event.image_position || 'center center',
    signupLink: event.signup_link || event.signupLink || event.event_signup_link || '',
    status: event.status || 'Upcoming',
    eventType: event.event_type || event.eventType || 'standard',
    isRecurring: Boolean(event.is_recurring || event.isRecurring),
  };
}

const statusChip = {
  Upcoming: { label: 'UPCOMING', bg: GREEN_BG, fg: GREEN },
  Past: { label: 'MEMORY 回忆', bg: '#f0ede7', fg: MUTED },
  Cancelled: { label: 'CANCELLED 已取消', bg: RED_BG, fg: RED },
};

function EventChip({ label, bg, fg, icon }) {
  return (
    <Chip
      icon={icon}
      label={label}
      size="small"
      sx={{
        backgroundColor: bg,
        color: fg,
        fontWeight: 700,
        fontSize: '0.65rem',
        letterSpacing: '0.02em',
        height: 20,
        '& .MuiChip-icon': { color: fg, fontSize: 14 },
      }}
    />
  );
}

/**
 * The one event card. Used by CalendarPage (featured grid + upcoming list),
 * HighlightsPage and any future surface.
 *
 * density: 'grid' (vertical, image on top) | 'row' (horizontal, image left)
 * adminActions: node rendered in the top-right icon cluster (pages own their
 *   admin logic — edit/delete/star/QR/drag — and pass the buttons in)
 * interactive: false renders a static preview (used by EventComposer)
 */
export default function EventCard({
  event,
  density = 'grid',
  onClick,
  onShare,
  adminActions = null,
  showEngagement = true,
  showGalleryPreview = false,
  showDescription = false,
  interactive = true,
  sx = {},
}) {
  const ev = normalizeEvent(event);
  const bubble = parseBubbleDate(ev.date);
  const isCancelled = ev.status === 'Cancelled';
  const isUpcoming = ev.status === 'Upcoming';
  const hasSignup = Boolean(ev.signupLink) && isUpcoming;
  const chip = statusChip[ev.status];
  const isGrid = density === 'grid';

  const handleCardClick = () => {
    if (interactive && onClick) onClick(event);
  };

  const handleCta = (e) => {
    e.stopPropagation();
    if (!interactive) return;
    if (hasSignup) {
      window.open(ev.signupLink, '_blank', 'noopener,noreferrer');
    } else if (onClick) {
      onClick(event);
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    if (interactive && onShare) onShare(event);
  };

  const handleImageError = (e) => {
    e.target.src = FALLBACK_EVENT_IMAGE;
  };

  return (
    <Card
      elevation={0}
      onClick={handleCardClick}
      data-testid="event-card"
      sx={{
        display: 'flex',
        flexDirection: isGrid ? 'column' : { xs: 'column', sm: 'row' },
        height: isGrid ? '100%' : 'auto',
        minHeight: isGrid ? 'auto' : { sm: 180 },
        backgroundColor: 'white',
        border: `1px solid ${LINE}`,
        borderRadius: '12px',
        boxShadow: CARD_SHADOW,
        overflow: 'hidden',
        position: 'relative',
        opacity: isCancelled ? 0.75 : 1,
        ...(interactive && {
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: CARD_HOVER_SHADOW,
          },
        }),
        ...sx,
      }}
    >
      {/* Image with date bubble */}
      <Box
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: isGrid ? '100%' : { xs: '100%', sm: 220 },
        }}
      >
        <EventCardImage
          event={{ ...event, image: ev.image || FALLBACK_EVENT_IMAGE, image_position: ev.imagePosition }}
          onError={handleImageError}
          sx={{
            height: isGrid ? 190 : { xs: 150, sm: '100%' },
            filter: isCancelled ? 'grayscale(0.6)' : 'none',
          }}
        />
        {bubble && (
          <Box
            sx={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              width: 48,
              height: 48,
              borderRadius: '12px',
              backgroundColor: 'rgba(255,255,255,0.95)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: ORANGE, lineHeight: 1.1 }}>
              {bubble.day}
            </Typography>
            <Typography sx={{ fontSize: '0.59rem', fontWeight: 700, letterSpacing: '0.1em', color: MUTED }}>
              {bubble.month}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        {/* Chip row + action icons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {chip && <EventChip label={chip.label} bg={chip.bg} fg={chip.fg} />}
          {ev.eventType === 'race' && <EventChip label="RACE 比赛" bg={BLUE_BG} fg={BLUE} />}
          {ev.eventType === 'heylo' && <EventChip label="HEYLO" bg={BLUE_BG} fg={BLUE} />}
          {ev.isRecurring && (
            <EventChip icon={<RepeatIcon />} label="RECURRING" bg={ORANGE_BG} fg={ORANGE} />
          )}
          <Box sx={{ marginLeft: 'auto', display: 'flex', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
            {onShare && (
              <Tooltip title="Share event / 分享活动">
                <IconButton size="small" onClick={handleShare} aria-label="share event" sx={{ color: MUTED, '&:hover': { color: ORANGE, backgroundColor: ORANGE_BG } }}>
                  <ShareIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {adminActions}
          </Box>
        </Box>

        {/* Title */}
        <Typography
          variant="h6"
          sx={{
            fontSize: { xs: '1rem', sm: '1.05rem' },
            fontWeight: 600,
            lineHeight: 1.3,
            textDecoration: isCancelled ? 'line-through' : 'none',
            color: isCancelled ? MUTED : 'inherit',
          }}
        >
          {ev.name}
          {ev.chineseName && (
            <Typography component="span" sx={{ fontSize: '0.85rem', color: MUTED, ml: 1 }}>
              {ev.chineseName}
            </Typography>
          )}
        </Typography>

        {/* Meta: time + location */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {(ev.date || ev.time) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 15, color: ORANGE }} />
              <Typography variant="body2" sx={{ color: MUTED, fontSize: '0.8rem' }}>
                {[ev.date, ev.time].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          )}
          {ev.location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PlaceIcon sx={{ fontSize: 15, color: ORANGE }} />
              <Typography variant="body2" sx={{ color: MUTED, fontSize: '0.8rem' }}>
                {ev.location}
                {ev.chineseLocation ? ` ${ev.chineseLocation}` : ''}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Description (grid/featured density only) */}
        {showDescription && ev.description && (
          <Typography
            variant="body2"
            sx={{
              color: MUTED,
              fontSize: '0.8rem',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {ev.description}
          </Typography>
        )}

        {showGalleryPreview && ev.id && (
          <EventGalleryPreview eventId={ev.id} maxImages={5} size={36} />
        )}

        {showEngagement && ev.id && <EventEngagementBar eventId={ev.id} />}

        {/* Context-aware CTA */}
        <Button
          variant={hasSignup ? 'contained' : 'outlined'}
          disableElevation
          onClick={handleCta}
          sx={{
            mt: 'auto',
            alignSelf: isGrid ? 'stretch' : 'flex-start',
            borderRadius: '99px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: { xs: '0.8125rem', sm: '0.875rem' },
            px: 2.5,
            py: 0.9,
            opacity: isCancelled ? 0.6 : 1,
            ...(hasSignup
              ? {
                  backgroundColor: ORANGE,
                  color: 'white',
                  '&:hover': { backgroundColor: ORANGE_DARK },
                }
              : {
                  borderColor: ORANGE,
                  borderWidth: '1.5px',
                  color: ORANGE,
                  '&:hover': { backgroundColor: ORANGE, borderColor: ORANGE, color: 'white', borderWidth: '1.5px' },
                }),
            '&:active': { transform: 'scale(0.98)' },
          }}
        >
          {hasSignup ? 'Sign Up 报名' : 'View Details 查看详情'}
        </Button>
      </Box>
    </Card>
  );
}
