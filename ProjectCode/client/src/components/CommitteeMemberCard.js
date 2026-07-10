import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

// Design tokens (match HomePage / NavBar design language)
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';

export default function CommitteeMemberCard({ member, onImageClick }) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'white',
      border: `1px solid ${LINE}`,
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
      overflow: 'hidden',
      transition: 'all 0.2s ease',
      '&:hover': {
        boxShadow: '0 8px 24px rgba(255,165,0,0.35)',
        transform: 'translateY(-3px)'
      }
    }}>
      {imageError || !member.image ? (
        <Box
          onClick={() => member.image && onImageClick(member.image)}
          sx={{
            width: '100%',
            aspectRatio: '1',
            backgroundColor: '#e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: member.image ? 'pointer' : 'default'
          }}
        >
          <PersonIcon sx={{ fontSize: 80, color: '#9e9e9e' }} />
        </Box>
      ) : (
        <Box
          component="img"
          src={member.image}
          alt={`Committee Member ${member.name}`}
          loading="lazy"
          onClick={() => onImageClick(member.image)}
          onError={handleImageError}
          sx={{
            width: '100%',
            aspectRatio: '1',
            objectFit: 'cover',
            display: 'block',
            transition: 'transform 0.2s ease',
            cursor: 'pointer',
            '&:hover': {
              transform: 'scale(1.04)'
            }
          }}
        />
      )}
      <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5, textAlign: 'center' }}>
        <Typography
          sx={{
            color: INK,
            fontWeight: 700,
            fontSize: '0.9rem'
          }}
        >
          {member.name}
        </Typography>
        <Typography
          sx={{
            color: MUTED,
            fontSize: '0.78rem',
            lineHeight: 1.4,
            mt: 0.25
          }}
        >
          {member.position.en}
          <br />
          {member.position.zh}
        </Typography>
      </Box>
    </Box>
  );
}
