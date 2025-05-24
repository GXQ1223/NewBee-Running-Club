import GitHubIcon from '@mui/icons-material/GitHub';
import GoogleIcon from '@mui/icons-material/Google';
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// import { useAuth } from '../context/AuthContext';
import {
  loginWithEmailAndPassword,
  signInWithGithub,
  signInWithGoogle
} from '../firebase/auth';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEmailPasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { user, error } = await loginWithEmailAndPassword(email, password);
      if (error) {
        setError(error);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Failed to sign in');
    }
    
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    
    try {
      const { user, error } = await signInWithGoogle();
      if (error) {
        setError(error);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Failed to sign in with Google');
    }
    
    setLoading(false);
  };

  const handleGithubSignIn = async () => {
    setError('');
    setLoading(true);
    
    try {
      const { user, error } = await signInWithGithub();
      if (error) {
        setError(error);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Failed to sign in with GitHub');
    }
    
    setLoading(false);
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" align="center" gutterBottom sx={{ color: 'black' }}>
          Sign In
        </Typography>
        
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <form onSubmit={handleEmailPasswordLogin}>
          <TextField
            label="Email"
            type="email"
            variant="outlined"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            variant="outlined"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <Button 
            type="submit" 
            variant="contained" 
            fullWidth 
            size="large"
            disabled={loading}
            sx={{ 
              mt: 2,
              backgroundColor: '#FFB84D',
              color: 'white',
              textTransform: 'none',
              fontSize: '16px',
              px: 2,
              py: 1.5,
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
            Sign In
          </Button>
        </form>
        
        <Box sx={{ mt: 2, mb: 2 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: '#FFB84D' } }}>
            <Typography sx={{ color: '#FFB84D' }}>OR</Typography>
          </Divider>
        </Box>
        
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Button 
              variant="outlined" 
              startIcon={<GoogleIcon />}
              fullWidth
              onClick={handleGoogleSignIn}
              disabled={loading}
              sx={{
                borderColor: '#FFB84D',
                color: '#FFB84D',
                textTransform: 'none',
                fontSize: '16px',
                px: 2,
                py: 1.5,
                borderRadius: '12px',
                '&:hover': {
                  borderColor: '#FFA833',
                  backgroundColor: 'rgba(255, 184, 77, 0.04)',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                  transform: 'translateY(-2px)',
                },
                '&:active': {
                  transform: 'translateY(1px) scale(0.98)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }
              }}
            >
              Google
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button 
              variant="outlined" 
              startIcon={<GitHubIcon />}
              fullWidth
              onClick={handleGithubSignIn}
              disabled={loading}
              sx={{
                borderColor: '#FFB84D',
                color: '#FFB84D',
                textTransform: 'none',
                fontSize: '16px',
                px: 2,
                py: 1.5,
                borderRadius: '12px',
                '&:hover': {
                  borderColor: '#FFA833',
                  backgroundColor: 'rgba(255, 184, 77, 0.04)',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                  transform: 'translateY(-2px)',
                },
                '&:active': {
                  transform: 'translateY(1px) scale(0.98)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }
              }}
            >
              GitHub
            </Button>
          </Grid>
        </Grid>
        
        <Typography align="center" sx={{ mt: 3 }}>
          Don't have an account? <Link to="/register" style={{ color: '#FFB84D', textDecoration: 'none', '&:hover': { color: '#FFA833' } }}>Register</Link>
        </Typography>
      </Paper>
    </Container>
  );
};

export default LoginPage; 