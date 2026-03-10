import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NavigationButtons from '../components/NavigationButtons';
import { useAuth } from '../context/AuthContext';
import { getApprovedTips, submitTip, toggleUpvote } from '../api/trainingTips';
import { getAnonymousId } from '../api/engagement';
import GroupsIcon from '@mui/icons-material/Groups';
import RouteIcon from '@mui/icons-material/Route';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import AddIcon from '@mui/icons-material/Add';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

const steps = ['Introduction', 'Race Info', 'Fitness', 'Duration'];

const raceTypes = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'half', label: 'Half Marathon' },
  { value: 'full', label: 'Full Marathon' }
];

const trainingDurations = [
  { value: 4, label: '4 Weeks' },
  { value: 8, label: '8 Weeks' },
  { value: 12, label: '12 Weeks' },
  { value: 16, label: '16 Weeks' },
  { value: 20, label: '20 Weeks' },
  { value: 24, label: '24 Weeks' },
  { value: 36, label: '36 Weeks' },
  { value: 48, label: '48 Weeks' }
];

// Popular routes data (will be fetched from API in future)
const popularRoutes = [
  {
    id: 1,
    name: 'Central Park Loop',
    nameCn: '中央公园环线',
    distance: '6.1 mi',
    difficulty: 'Easy',
    rating: 4.8,
    description: 'The classic loop around Central Park. Great for all skill levels with smooth paths and scenic views.'
  },
  {
    id: 2,
    name: 'Brooklyn Bridge Run',
    nameCn: '布鲁克林大桥跑',
    distance: '3.2 mi',
    difficulty: 'Moderate',
    rating: 4.6,
    description: 'Cross the iconic Brooklyn Bridge and back. Best done early morning to avoid pedestrian traffic.'
  },
  {
    id: 3,
    name: 'Prospect Park Hills',
    nameCn: '展望公园山路',
    distance: '5.5 mi',
    difficulty: 'Hard',
    rating: 4.7,
    description: 'Challenging hill workout with the famous Harlem Hill. Great for marathon training.'
  }
];

const getCategoryColor = (category) => {
  const colors = {
    recovery: '#4CAF50',
    nutrition: '#FF9800',
    technique: '#2196F3',
    mental: '#9C27B0',
    gear: '#795548'
  };
  return colors[category] || '#FFA500';
};


// Helper to extract video embed URL
const getVideoEmbedUrl = (url, platform) => {
  if (!url) return null;

  if (platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
    // Extract YouTube video ID
    let videoId = null;
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    } else if (url.includes('watch?v=')) {
      videoId = url.split('watch?v=')[1]?.split('&')[0];
    } else if (url.includes('embed/')) {
      videoId = url.split('embed/')[1]?.split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }

  if (platform === 'bilibili' || url.includes('bilibili.com')) {
    // Extract Bilibili video ID
    let bvid = null;
    const match = url.match(/BV[\w]+/);
    if (match) {
      bvid = match[0];
    }
    return bvid ? `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1` : null;
  }

  return null;
};

export default function TrainingPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    raceType: '',
    targetTime: '',
    current5k: '',
    current10k: '',
    currentHalf: '',
    currentFull: '',
    trainingDuration: ''
  });
  const [planGenerated, setPlanGenerated] = useState(false);

  // Tips state
  const [tips, setTips] = useState([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState('');
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [tipFormData, setTipFormData] = useState({
    category: '',
    title: '',
    title_cn: '',
    content: '',
    content_cn: '',
    video_url: '',
    video_platform: ''
  });
  const [expandedVideo, setExpandedVideo] = useState(null);

  // Fetch tips from API
  useEffect(() => {
    const fetchTips = async () => {
      setTipsLoading(true);
      try {
        const anonymousId = getAnonymousId();
        const data = await getApprovedTips(null, anonymousId, currentUser?.uid);
        setTips(data);
        setTipsError('');
      } catch (err) {
        console.error('Error fetching tips:', err);
        // Fall back to default tips if API fails
        setTips([
          {
            id: 1,
            category: 'recovery',
            title: 'Post-Run Stretching Routine',
            title_cn: '跑后拉伸套路',
            content: 'Spend at least 10 minutes stretching after every run. Focus on hip flexors, hamstrings, quads, and calves.',
            author_name: 'NewBee Team',
            upvotes: 42,
            user_upvoted: false
          },
          {
            id: 2,
            category: 'nutrition',
            title: 'Race Day Breakfast',
            title_cn: '比赛日早餐',
            content: 'Eat a familiar breakfast 2-3 hours before your race. Include easily digestible carbs and avoid high fiber foods.',
            author_name: 'Coach Mike',
            upvotes: 38,
            user_upvoted: false
          },
          {
            id: 3,
            category: 'technique',
            title: 'Cadence Training',
            title_cn: '步频训练',
            content: 'Aim for 170-180 steps per minute. Use a metronome app during easy runs to gradually increase your cadence.',
            author_name: 'Jenny L.',
            upvotes: 35,
            user_upvoted: false
          },
          {
            id: 4,
            category: 'mental',
            title: 'Breaking Down Long Runs',
            title_cn: '分解长跑',
            content: 'Mentally divide long runs into smaller segments. Focus only on reaching the next mile marker, not the full distance.',
            author_name: 'David W.',
            upvotes: 31,
            user_upvoted: false
          }
        ]);
        setTipsError('Unable to load tips from server. Showing sample tips.');
      } finally {
        setTipsLoading(false);
      }
    };

    fetchTips();
  }, [currentUser]);

  // Upvote handler
  const handleUpvote = async (tipId) => {
    try {
      const anonymousId = getAnonymousId();
      const result = await toggleUpvote(tipId, anonymousId, currentUser?.uid);
      setTips(prev => prev.map(tip =>
        tip.id === tipId
          ? { ...tip, upvotes: result.upvotes, user_upvoted: result.user_upvoted }
          : tip
      ));
    } catch (err) {
      console.error('Error toggling upvote:', err);
      setTipsError('Failed to update vote. Please try again. / 投票失败，请重试。');
    }
  };

  // Submit tip handlers
  const handleSubmitDialogOpen = () => {
    setTipFormData({
      category: '',
      title: '',
      title_cn: '',
      content: '',
      content_cn: '',
      video_url: '',
      video_platform: ''
    });
    setSubmitDialogOpen(true);
  };

  const handleSubmitDialogClose = () => {
    setSubmitDialogOpen(false);
    setSubmitSuccess('');
  };

  const handleTipFormChange = (field) => (event) => {
    setTipFormData(prev => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmitTip = async () => {
    setSubmitting(true);
    try {
      await submitTip(tipFormData, currentUser?.uid);
      setSubmitSuccess('Tip submitted successfully! It will appear after admin approval.');
      setTipFormData({
        category: '',
        title: '',
        title_cn: '',
        content: '',
        content_cn: '',
        video_url: '',
        video_platform: ''
      });
    } catch (err) {
      console.error('Error submitting tip:', err);
      setTipsError('Failed to submit tip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    });
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const isStepValid = () => {
    switch (activeStep) {
      case 1:
        return formData.raceType && formData.targetTime;
      case 2:
        return formData.current5k || formData.current10k || formData.currentHalf || formData.currentFull;
      case 3:
        return formData.trainingDuration;
      default:
        return true;
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // TODO: Send data to AI system and generate training plan
    console.log('Form submitted:', formData);
    setPlanGenerated(true);
  };

  const handleReset = () => {
    setActiveStep(0);
    setFormData({
      raceType: '',
      targetTime: '',
      current5k: '',
      current10k: '',
      currentHalf: '',
      currentFull: '',
      trainingDuration: ''
    });
    setPlanGenerated(false);
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 1, sm: 2 } }}>
            <Typography variant="h5" sx={{ mb: { xs: 2, sm: 3 }, color: '#333', fontSize: { xs: '1.1rem', sm: '1.5rem' } }}>
              Our Training Philosophy
              <br />
              <span style={{ color: '#666' }}>我们的训练理念</span>
            </Typography>
            <Typography variant="body1" sx={{ mb: { xs: 2, sm: 3 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
              Our AI-powered training system is built on proven methodologies from renowned running coaches and scientific research. We incorporate principles from:
            </Typography>
            <Box component="ul" sx={{ pl: { xs: 2, sm: 4 }, mb: { xs: 2, sm: 3 } }}>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                <strong>Advanced Marathoning</strong> by Pete Pfitzinger and Scott Douglas
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                <strong>Daniels' Running Formula</strong> by Jack Daniels
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                <strong>Hansons Marathon Method</strong> by Luke Humphrey
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                <strong>80/20 Running</strong> by Matt Fitzgerald
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ mb: { xs: 2, sm: 3 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
              Our system analyzes your current fitness level, race goals, and available training time to create a personalized plan that balances:
            </Typography>
            <Box component="ul" sx={{ pl: { xs: 2, sm: 4 }, mb: { xs: 2, sm: 3 } }}>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                Progressive overload and recovery
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                Aerobic and anaerobic development
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                Race-specific workouts
              </Typography>
              <Typography component="li" sx={{ mb: { xs: 1, sm: 2 }, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                Injury prevention
              </Typography>
            </Box>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Race Type / 比赛类型</InputLabel>
              <Select
                value={formData.raceType}
                onChange={handleInputChange('raceType')}
                label="Race Type / 比赛类型"
              >
                {raceTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Target Time / 目标时间"
              value={formData.targetTime}
              onChange={handleInputChange('targetTime')}
              helperText="Format: HH:MM:SS (e.g., 01:45:00 for 1 hour 45 minutes)"
              sx={{ mb: 3 }}
            />
          </Box>
        );

      case 2:
        return (
          <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Please provide your current best times (if available):
              <br />
              <span style={{ color: '#666' }}>请提供您目前的最佳成绩（如有）：</span>
            </Typography>

            <TextField
              fullWidth
              label="5K Time / 5公里时间"
              value={formData.current5k}
              onChange={handleInputChange('current5k')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="10K Time / 10公里时间"
              value={formData.current10k}
              onChange={handleInputChange('current10k')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Half Marathon Time / 半马时间"
              value={formData.currentHalf}
              onChange={handleInputChange('currentHalf')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Full Marathon Time / 全马时间"
              value={formData.currentFull}
              onChange={handleInputChange('currentFull')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />
          </Box>
        );

      case 3:
        return (
          <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Training Duration / 训练时长</InputLabel>
              <Select
                value={formData.trainingDuration}
                onChange={handleInputChange('trainingDuration')}
                label="Training Duration / 训练时长"
              >
                {trainingDurations.map((duration) => (
                  <MenuItem key={duration.value} value={duration.value}>
                    {duration.label}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Select how long you want to train for your goal race
                <br />
                选择您想要为目标比赛训练的时间长度
              </FormHelperText>
            </FormControl>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.25, sm: 0.5 } }}>
      {/* Navigation Buttons */}
      <NavigationButtons />

      {/* Training Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: { xs: 2, sm: 4 } }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          Training with Us
          <br />
          和我们一起训练
        </Typography>

        {/* Feature Cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} md={3}>
            <Card
              onClick={() => navigate('/training/ai')}
              sx={{
                height: '100%',
                textAlign: 'center',
                border: '2px solid #FFA500',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent>
                <SmartToyIcon sx={{ fontSize: 40, color: '#FFA500', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>AI Training Partner</Typography>
                <Typography variant="body2" color="text.secondary">智能训练伙伴</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card
              onClick={() => navigate('/training/ai')}
              sx={{
                height: '100%',
                textAlign: 'center',
                border: '2px solid #FFA500',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent>
                <CalendarMonthIcon sx={{ fontSize: 40, color: '#FFA500', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>Custom Plans</Typography>
                <Typography variant="body2" color="text.secondary">定制计划</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card
              onClick={() => navigate('/training/community')}
              sx={{
                height: '100%',
                textAlign: 'center',
                border: '2px solid #FFA500',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent>
                <GroupsIcon sx={{ fontSize: 40, color: '#FFA500', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>Community</Typography>
                <Typography variant="body2" color="text.secondary">社区智慧</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card
              onClick={() => navigate('/training/routes')}
              sx={{
                height: '100%',
                textAlign: 'center',
                border: '2px solid #FFA500',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent>
                <RouteIcon sx={{ fontSize: 40, color: '#FFA500', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600}>NYC Routes</Typography>
                <Typography variant="body2" color="text.secondary">纽约跑步路线</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* AI Training Plan Generator */}
        {(currentPath === '/training/ai' || currentPath === '/training') && (
        <Box sx={{ py: 3 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2">
              This training plan is generated by AI. AI might make mistakes. Please consult a professional trainer for personalized advice.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              此训练计划由AI生成。AI可能会出错。请咨询专业教练以获得个性化建议。
            </Typography>
          </Alert>
          <Box sx={{
            backgroundColor: 'white',
            borderRadius: { xs: '8px', sm: '12px' },
            p: { xs: 2, sm: 3, md: 6 },
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
          }}>
            {!planGenerated ? (
              <>
                <Box sx={{ width: '100%', overflowX: 'auto', mb: { xs: 3, sm: 4 } }}>
                  <Stepper
                    activeStep={activeStep}
                    alternativeLabel
                    sx={{
                      minWidth: { xs: 300, sm: 'auto' },
                      '& .MuiStepLabel-label': {
                        fontSize: { xs: '0.6rem', sm: '0.875rem' },
                        mt: { xs: 0.5, sm: 1 }
                      },
                      '& .MuiStepIcon-root': {
                        fontSize: { xs: '1.1rem', sm: '1.5rem' }
                      },
                      '& .MuiStepIcon-root.Mui-active': {
                        color: '#FFA500'
                      },
                      '& .MuiStepIcon-root.Mui-completed': {
                        color: '#FFA500'
                      },
                      '& .MuiStepConnector-line': {
                        minWidth: { xs: 20, sm: 40 }
                      }
                    }}
                  >
                    {steps.map((label) => (
                      <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>
                </Box>

                {renderStepContent(activeStep)}

                <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 1, sm: 2 }, mt: { xs: 3, sm: 4 } }}>
                  {activeStep > 0 && (
                    <Button
                      variant="outlined"
                      onClick={handleBack}
                      sx={{
                        color: '#FFA500',
                        borderColor: '#FFA500',
                        '&:hover': {
                          borderColor: '#FFA500',
                          backgroundColor: 'rgba(255, 165, 0, 0.1)',
                        },
                        px: { xs: 2, sm: 4 },
                        py: { xs: 1, sm: 1.5 },
                        fontSize: { xs: '0.875rem', sm: '1.1rem' }
                      }}
                    >
                      Back / 返回
                    </Button>
                  )}
                  {activeStep < steps.length - 1 ? (
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      disabled={!isStepValid()}
                      sx={{
                        backgroundColor: '#FFA500',
                        '&:hover': {
                          backgroundColor: '#FF8C00',
                        },
                        '&.Mui-disabled': {
                          backgroundColor: 'rgba(255, 165, 0, 0.5)',
                          color: 'white'
                        },
                        px: { xs: 2, sm: 4 },
                        py: { xs: 1, sm: 1.5 },
                        fontSize: { xs: '0.875rem', sm: '1.1rem' }
                      }}
                    >
                      Next / 下一步
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={handleSubmit}
                      disabled={!isStepValid()}
                      sx={{
                        backgroundColor: '#FFA500',
                        '&:hover': {
                          backgroundColor: '#FF8C00',
                        },
                        '&.Mui-disabled': {
                          backgroundColor: 'rgba(255, 165, 0, 0.5)',
                          color: 'white'
                        },
                        px: { xs: 2, sm: 4 },
                        py: { xs: 1, sm: 1.5 },
                        fontSize: { xs: '0.875rem', sm: '1.1rem' }
                      }}
                    >
                      Generate Plan / 生成计划
                    </Button>
                  )}
                </Box>
              </>
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <Alert severity="info" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
                  <Typography variant="h6" gutterBottom>
                    AI Training Plan Generator - Coming Soon!
                  </Typography>
                  <Typography variant="body2">
                    We're building an intelligent training system powered by AI. Your personalized training plan based on:
                  </Typography>
                  <Box sx={{ mt: 2, textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Race:</strong> {raceTypes.find(r => r.value === formData.raceType)?.label}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Target Time:</strong> {formData.targetTime}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Duration:</strong> {trainingDurations.find(d => d.value === parseInt(formData.trainingDuration))?.label}
                    </Typography>
                  </Box>
                </Alert>

                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  AI智能训练计划生成器即将上线！我们正在构建一个由人工智能驱动的智能训练系统。
                </Typography>

                <Button
                  variant="outlined"
                  onClick={handleReset}
                  sx={{
                    color: '#FFA500',
                    borderColor: '#FFA500',
                    '&:hover': {
                      borderColor: '#FFA500',
                      backgroundColor: 'rgba(255, 165, 0, 0.1)',
                    },
                  }}
                >
                  Start Over / 重新开始
                </Button>
              </Box>
            )}
          </Box>
        </Box>
        )}

        {/* Community Tips */}
        {currentPath === '/training/community' && (
        <Box sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Community Training Tips / 社区训练技巧
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleSubmitDialogOpen}
              sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#FF8C00' } }}
            >
              Submit a Tip
            </Button>
          </Box>

          {tipsError && (
            <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setTipsError('')}>
              {tipsError}
            </Alert>
          )}

          {submitSuccess && (
            <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSubmitSuccess('')}>
              {submitSuccess}
            </Alert>
          )}

          <Alert severity="info" sx={{ mb: 3 }}>
            Tips from NewBee members! Submit your own tips and upvote helpful advice. Tips with video content are also welcome!
            <br />
            来自新蜂成员的技巧！提交您自己的技巧并为有用的建议点赞。欢迎附带视频内容的技巧！
          </Alert>

          {tipsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#FFA500' }} />
            </Box>
          ) : (
            <Grid container spacing={3}>
              {tips.map((tip) => (
                <Grid item xs={12} md={6} key={tip.id}>
                  <Card sx={{
                    height: '100%',
                    transition: 'transform 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
                  }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <Chip
                              label={tip.category}
                              size="small"
                              sx={{
                                backgroundColor: getCategoryColor(tip.category),
                                color: 'white'
                              }}
                            />
                            {tip.video_url && (
                              <Chip
                                icon={<PlayCircleOutlineIcon sx={{ fontSize: 14 }} />}
                                label="Video"
                                size="small"
                                variant="outlined"
                                sx={{ borderColor: '#FFA500', color: '#FFA500' }}
                              />
                            )}
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {tip.title}
                          </Typography>
                          {tip.title_cn && (
                            <Typography variant="body2" color="text.secondary">
                              {tip.title_cn}
                            </Typography>
                          )}
                        </Box>
                        <Tooltip title={tip.user_upvoted ? "Remove upvote" : "Upvote this tip"}>
                          <IconButton
                            onClick={() => handleUpvote(tip.id)}
                            sx={{
                              color: tip.user_upvoted ? '#FFA500' : 'inherit',
                              '&:hover': { backgroundColor: 'rgba(255, 165, 0, 0.1)' }
                            }}
                          >
                            {tip.user_upvoted ? <ThumbUpIcon /> : <ThumbUpOutlinedIcon />}
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <Typography variant="body1" sx={{ mb: 2 }}>
                        {tip.content}
                      </Typography>
                      {tip.content_cn && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {tip.content_cn}
                        </Typography>
                      )}

                      {/* Video Embed */}
                      {tip.video_url && (
                        <Box sx={{ mb: 2 }}>
                          {expandedVideo === tip.id ? (
                            <Box sx={{ position: 'relative', paddingTop: '56.25%', width: '100%' }}>
                              <iframe
                                src={getVideoEmbedUrl(tip.video_url, tip.video_platform)}
                                title={tip.title}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  borderRadius: '8px'
                                }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </Box>
                          ) : (
                            <Button
                              variant="outlined"
                              startIcon={<PlayCircleOutlineIcon />}
                              onClick={() => setExpandedVideo(tip.id)}
                              sx={{
                                color: '#FFA500',
                                borderColor: '#FFA500',
                                '&:hover': { borderColor: '#FF8C00', backgroundColor: 'rgba(255, 165, 0, 0.1)' }
                              }}
                            >
                              Watch Video
                            </Button>
                          )}
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          Shared by {tip.author_name || 'Anonymous'}
                        </Typography>
                        <Chip
                          icon={<ThumbUpIcon sx={{ fontSize: 14 }} />}
                          label={`${tip.upvotes} upvotes`}
                          variant="outlined"
                          size="small"
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              {tips.length === 0 && !tipsLoading && (
                <Grid item xs={12}>
                  <Alert severity="info">
                    No tips available yet. Be the first to submit a tip!
                    <br />
                    暂无技巧。成为第一个提交技巧的人吧！
                  </Alert>
                </Grid>
              )}
            </Grid>
          )}
        </Box>
        )}

        {/* Routes */}
        {currentPath === '/training/routes' && (
        <Box sx={{ py: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Popular NYC Running Routes / 热门纽约跑步路线
          </Typography>

          <Alert severity="info" sx={{ mb: 3 }}>
            Discover the best running routes in New York City, contributed by NewBee members.
            <br />
            发现纽约市最佳跑步路线，由新蜂成员贡献。
          </Alert>

          <Grid container spacing={3}>
            {popularRoutes.map((route) => (
              <Grid item xs={12} md={4} key={route.id}>
                <Card sx={{
                  height: '100%',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
                }}>
                  <Box sx={{
                    height: 150,
                    backgroundColor: 'rgba(255, 165, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <RouteIcon sx={{ fontSize: 60, color: '#FFA500' }} />
                  </Box>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {route.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {route.nameCn}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Chip label={route.distance} size="small" variant="outlined" />
                      <Chip
                        label={route.difficulty}
                        size="small"
                        sx={{
                          backgroundColor: route.difficulty === 'Easy' ? '#4CAF50' :
                            route.difficulty === 'Moderate' ? '#FF9800' : '#F44336',
                          color: 'white'
                        }}
                      />
                      <Chip label={`${route.rating} stars`} size="small" variant="outlined" />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {route.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
        )}
      </Container>

      {/* Submit Tip Dialog */}
      <Dialog open={submitDialogOpen} onClose={handleSubmitDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Submit a Training Tip / 提交训练技巧
        </DialogTitle>
        <DialogContent>
          {submitSuccess ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              {submitSuccess}
              <br />
              您的技巧已提交成功！管理员审核后将会显示。
            </Alert>
          ) : (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Category / 类别</InputLabel>
                  <Select
                    value={tipFormData.category}
                    onChange={handleTipFormChange('category')}
                    label="Category / 类别"
                  >
                    <MenuItem value="recovery">Recovery / 恢复</MenuItem>
                    <MenuItem value="nutrition">Nutrition / 营养</MenuItem>
                    <MenuItem value="technique">Technique / 技巧</MenuItem>
                    <MenuItem value="mental">Mental / 心理</MenuItem>
                    <MenuItem value="gear">Gear / 装备</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Title (English)"
                  value={tipFormData.title}
                  onChange={handleTipFormChange('title')}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Title (Chinese)"
                  value={tipFormData.title_cn}
                  onChange={handleTipFormChange('title_cn')}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Content (English)"
                  value={tipFormData.content}
                  onChange={handleTipFormChange('content')}
                  multiline
                  rows={3}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Content (Chinese)"
                  value={tipFormData.content_cn}
                  onChange={handleTipFormChange('content_cn')}
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Video URL (YouTube or Bilibili)"
                  value={tipFormData.video_url}
                  onChange={handleTipFormChange('video_url')}
                  helperText="Optional: Add a video to demonstrate your tip"
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Video Platform</InputLabel>
                  <Select
                    value={tipFormData.video_platform}
                    onChange={handleTipFormChange('video_platform')}
                    label="Video Platform"
                  >
                    <MenuItem value="">None</MenuItem>
                    <MenuItem value="youtube">YouTube</MenuItem>
                    <MenuItem value="bilibili">Bilibili</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">
                  Your tip will be reviewed by an admin before being published.
                  <br />
                  您的技巧将在管理员审核后发布。
                </Alert>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleSubmitDialogClose}>
            {submitSuccess ? 'Close' : 'Cancel'}
          </Button>
          {!submitSuccess && (
            <Button
              variant="contained"
              onClick={handleSubmitTip}
              disabled={submitting || !tipFormData.category || !tipFormData.title || !tipFormData.content}
              sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#FF8C00' } }}
            >
              {submitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
