import GoogleIcon from '@mui/icons-material/Google';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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
  registerWithEmailAndPassword,
  signInWithGoogle
} from '../firebase/auth';
import { submitExistingMemberAccountRequest } from '../api/members';

const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';

const authCardSx = {
  p: 4,
  backgroundColor: 'white',
  border: `1px solid ${LINE}`,
  borderRadius: '12px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
};

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError('Passwords do not match / 密码不匹配');
    }

    setError('');
    setLoading(true);

    try {
      const { user, error } = await registerWithEmailAndPassword(email, password, name);
      if (error) {
        // If pending approval, send committee notification and show success
        if (error.includes('pending')) {
          try {
            await submitExistingMemberAccountRequest({ name, email });
          } catch (notifyErr) {
            // Don't fail if notification fails - account is still created
            console.error('Failed to send committee notification:', notifyErr);
          }
          setSubmitted(true);
        } else {
          setError(error);
        }
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Failed to create an account / 创建账号失败');
    }

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const { user, error } = await signInWithGoogle();
      if (error) {
        if (error.includes('pending')) {
          try {
            const googleName = user?.displayName || name || 'Google User';
            const googleEmail = user?.email || email;
            await submitExistingMemberAccountRequest({ name: googleName, email: googleEmail });
          } catch (notifyErr) {
            console.error('Failed to send committee notification:', notifyErr);
          }
          setSubmitted(true);
        } else {
          setError(error);
        }
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Failed to sign up with Google / Google 注册失败');
    }

    setLoading(false);
  };

  // Success state after registration
  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, px: { xs: 1, sm: 2 } }}>
        <Paper elevation={0} sx={{ ...authCardSx, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 64, color: '#4CAF50', mb: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1.25, mb: 2 }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
              Account Created!
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
              账号已创建！
            </Typography>
          </Box>
          <Typography sx={{ color: INK, mb: 2 }}>
            Your account request has been sent to the NewBee Running Club committee for approval.
          </Typography>
          <Typography sx={{ color: MUTED, mb: 3 }}>
            您的账号申请已发送给新蜂跑团委员会审核。
          </Typography>
          <Typography sx={{ color: MUTED, fontSize: '0.9rem', mb: 3 }}>
            You will be able to log in once your account has been approved. This typically takes 1-3 business days.
            <br />
            账号审核通过后即可登录，通常需要1-3个工作日。
          </Typography>
          <Button
            component={Link}
            to="/login"
            variant="contained"
            disableElevation
            sx={{
              backgroundColor: ORANGE,
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '16px',
              px: 3,
              py: 1.2,
              borderRadius: '99px',
              boxShadow: '0 2px 6px rgba(255, 165, 0, 0.3)',
              '&:hover': {
                backgroundColor: ORANGE_DARK,
              }
            }}
          >
            Back to Login 返回登录
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8, px: { xs: 1, sm: 2 } }}>
      <Paper elevation={0} sx={authCardSx}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1.25, mb: 2 }}>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Create Account
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            创建账号
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 2, borderRadius: '12px', backgroundColor: ORANGE_BG, border: `1px solid ${LINE}`, '& .MuiAlert-icon': { color: ORANGE } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: INK }}>
            For existing NewBee Running Club members only.
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED }}>
            仅限新蜂跑团现有成员使用。
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, fontSize: '0.8rem', color: MUTED }}>
            Your request will be sent to the committee for verification. /
            您的请求将发送给委员会验证。
          </Typography>
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>{error}</Alert>}

        <form onSubmit={handleRegister}>
          <TextField
            label="Name 姓名"
            type="text"
            variant="outlined"
            fullWidth
            margin="normal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
          <TextField
            label="Confirm Password 确认密码"
            type="password"
            variant="outlined"
            fullWidth
            margin="normal"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
            Create Account 创建账号
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
          Google
        </Button>

        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.9rem', color: MUTED }}>
            Already have an account? <Link to="/login" style={{ color: ORANGE, fontWeight: 600, textDecoration: 'none' }}>Sign In 登录</Link>
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: MUTED }}>
            New to the club? <Link to="/join" style={{ color: ORANGE, fontWeight: 600, textDecoration: 'none' }}>Apply to join 申请加入</Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default RegisterPage;