import { Box, Container } from '@mui/material';

export default function Logo() {
  return (
    <Container maxWidth="xl" sx={{ px: 2, pt: 2, pb: 0 }}>
      <Box
        component="img"
        src="/pagelogo.png"
        alt="NewBee Running Club Logo"
        sx={{
          height: '80px',
          width: 'auto',
          objectFit: 'contain'
        }}
      />
    </Container>
  );
} 