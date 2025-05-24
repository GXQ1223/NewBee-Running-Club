import {
  Alert,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { logout } from '../firebase/auth';

const ProfilePage = () => {
  const { currentUser } = useAuth();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  const handleLogout = async () => {
    setError('');
    
    try {
      const { success, error } = await logout();
      if (error) {
        setError(error);
      }
    } catch (err) {
      setError('Failed to log out');
    }
  };

  if (!currentUser) return null;

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Avatar 
            src={currentUser.photoURL} 
            alt={currentUser.displayName || 'User'} 
            sx={{ width: 80, height: 80, mb: 2 }}
          />
          <Typography variant="h4" component="h1" gutterBottom>
            {currentUser.displayName || 'User'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {currentUser.email}
          </Typography>
        </Box>
        
        <Divider sx={{ mb: 3 }} />
        
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleLogout}
            size="large"
            sx={{
              backgroundColor: '#FFB84D',
              color: 'white',
              textTransform: 'none',
              fontSize: '17.5px',
              px: 2.75,
              py: 1.85,
              borderRadius: '12px',
              border: '2px solid #FFB84D',
              '&:hover': {
                backgroundColor: '#FFA833',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
              '&:active': {
                transform: 'translateY(1px) scale(0.98)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }
            }}
          >
            Log Out
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default ProfilePage; 