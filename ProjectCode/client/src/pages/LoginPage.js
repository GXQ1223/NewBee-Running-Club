import GoogleIcon from '@mui/icons-material/Google';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
    Alert,
    Box,
    Button,
    Container,
    Divider,
    Paper,
    TextField,
    Typography
} from '@mui/material';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    loginWithEmailAndPassword,
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
      const { error } = await loginWithEmailAndPassword(email, password);
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

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" align="center" gutterBottom sx={{ color: 'black' }}>
          Sign In 登录
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleEmailPasswordLogin}>
          <TextField
            label="Email 邮箱"
            type="email"
            variant="outlined"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password 密码"
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
            Sign In 登录
          </Button>
        </form>

        <Box sx={{ mt: 2, mb: 2 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: '#FFB84D' } }}>
            <Typography sx={{ color: '#FFB84D' }}>OR</Typography>
          </Divider>
        </Box>

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
          Sign in with Google
        </Button>

        <Box sx={{ mt: 3, mb: 1 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: '#e0e0e0' } }}>
            <Typography sx={{ color: '#999', fontSize: '0.85rem' }}>Don't have an account? 没有账号？</Typography>
          </Divider>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
          <Button
            component={Link}
            to="/register"
            variant="outlined"
            fullWidth
            startIcon={<PersonAddIcon />}
            sx={{
              textTransform: 'none',
              fontSize: '14px',
              py: 1.2,
              borderRadius: '12px',
              borderColor: '#FFB84D',
              color: '#FFB84D',
              '&:hover': {
                borderColor: '#FFA833',
                backgroundColor: 'rgba(255, 184, 77, 0.04)',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            Already a member? Create account directly
            <Typography component="span" sx={{ display: 'block', fontSize: '12px', color: '#999', ml: 0.5 }}>
              已是成员？直接创建账号
            </Typography>
          </Button>

          <Button
            component={Link}
            to="/join"
            variant="outlined"
            fullWidth
            startIcon={<GroupAddIcon />}
            sx={{
              textTransform: 'none',
              fontSize: '14px',
              py: 1.2,
              borderRadius: '12px',
              borderColor: '#4CAF50',
              color: '#4CAF50',
              '&:hover': {
                borderColor: '#388E3C',
                backgroundColor: 'rgba(76, 175, 80, 0.04)',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            New to the club? Apply to join
            <Typography component="span" sx={{ display: 'block', fontSize: '12px', color: '#999', ml: 0.5 }}>
              新成员？申请加入
            </Typography>
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default LoginPage;