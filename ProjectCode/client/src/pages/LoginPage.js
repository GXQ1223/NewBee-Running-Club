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

const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';

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
      const { error } = await signInWithGoogle();
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
    <Container maxWidth="sm" sx={{ mt: 8, px: { xs: 1, sm: 2 } }}>
      <Paper
        elevation={0}
        sx={{
          p: 4,
          backgroundColor: 'white',
          border: `1px solid ${LINE}`,
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1.25, mb: 2 }}>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Sign In
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            登录
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>{error}</Alert>}

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
            disableElevation
            sx={{
              mt: 2,
              backgroundColor: ORANGE,
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '16px',
              px: 2,
              py: 1.5,
              borderRadius: '99px',
              boxShadow: '0 2px 6px rgba(255, 165, 0, 0.3)',
              '&:hover': {
                backgroundColor: ORANGE_DARK,
                boxShadow: '0 4px 12px rgba(255, 165, 0, 0.35)',
              },
            }}
          >
            Sign In 登录
          </Button>
        </form>

        <Box sx={{ mt: 2, mb: 2 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: LINE } }}>
            <Typography sx={{ color: MUTED, fontSize: '0.85rem' }}>OR</Typography>
          </Divider>
        </Box>

        <Button
          variant="outlined"
          startIcon={<GoogleIcon />}
          fullWidth
          onClick={handleGoogleSignIn}
          disabled={loading}
          sx={{
            borderColor: ORANGE,
            color: ORANGE,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '16px',
            px: 2,
            py: 1.5,
            borderRadius: '99px',
            '&:hover': {
              borderColor: ORANGE_DARK,
              color: ORANGE_DARK,
              backgroundColor: ORANGE_BG,
            },
          }}
        >
          Sign in with Google
        </Button>

        <Box sx={{ mt: 3, mb: 1 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: LINE } }}>
            <Typography sx={{ color: MUTED, fontSize: '0.85rem' }}>Don't have an account? 没有账号？</Typography>
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
              fontWeight: 600,
              fontSize: '14px',
              py: 1.2,
              borderRadius: '99px',
              borderColor: ORANGE,
              color: ORANGE,
              '&:hover': {
                borderColor: ORANGE_DARK,
                color: ORANGE_DARK,
                backgroundColor: ORANGE_BG,
              },
            }}
          >
            Already a member? Create account directly
            <Typography component="span" sx={{ display: 'block', fontSize: '12px', fontWeight: 400, color: MUTED, ml: 0.5 }}>
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
              fontWeight: 600,
              fontSize: '14px',
              py: 1.2,
              borderRadius: '99px',
              borderColor: LINE,
              color: INK,
              '&:hover': {
                borderColor: ORANGE,
                color: ORANGE,
                backgroundColor: ORANGE_BG,
              },
            }}
          >
            New to the club? Apply to join
            <Typography component="span" sx={{ display: 'block', fontSize: '12px', fontWeight: 400, color: MUTED, ml: 0.5 }}>
              新成员？申请加入
            </Typography>
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default LoginPage;
