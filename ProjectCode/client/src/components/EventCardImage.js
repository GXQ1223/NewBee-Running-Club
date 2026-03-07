import { CardMedia } from '@mui/material';

export default function EventCardImage({ event, height, alt, loading = 'lazy', onError, sx = {} }) {
  return (
    <CardMedia
      component="img"
      height={height}
      image={event.image}
      alt={alt || event.name || event.title}
      loading={loading}
      onError={onError}
      sx={{
        objectFit: 'cover',
        objectPosition: event.image_position || 'center center',
        backgroundColor: '#f5f5f5',
        ...sx,
      }}
    />
  );
}
