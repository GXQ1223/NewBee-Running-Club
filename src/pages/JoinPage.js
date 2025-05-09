import { Box, Container, Typography } from '@mui/material';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function JoinPage() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Join Text */}
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
            Join NewBee
            加入新蜂
          </Typography>
        </Box>
      </Container>

      {/* Content will go here */}
    </Box>
  );
} 