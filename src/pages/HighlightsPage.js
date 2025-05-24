import { Box, Container, Typography } from '@mui/material';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function HighlightsPage() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Highlights Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 500,
              fontSize: '1.1rem',
              color: '#FFA500',
              whiteSpace: 'pre-line',
            }}
          >
            Highlights
            活动高光
          </Typography>
        </Box>
      </Container>

      {/* Content will go here */}
    </Box>
  );
} 