import { Box, Button, Container, FormControl, FormHelperText, InputLabel, MenuItem, Select, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

const steps = ['Introduction', 'Race Information', 'Current Fitness', 'Training Duration'];

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

export default function TrainingPage() {
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

  const formatTime = (time) => {
    // Convert time string (HH:MM:SS) to seconds
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // TODO: Send data to AI system and generate training plan
    console.log('Form submitted:', formData);
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <Typography variant="h5" sx={{ mb: 3, color: '#333' }}>
              Our Training Philosophy
              我们的训练理念
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Our AI-powered training system is built on proven methodologies from renowned running coaches and scientific research. We incorporate principles from:
            </Typography>
            <Box component="ul" sx={{ pl: 4, mb: 3 }}>
              <Typography component="li" sx={{ mb: 2 }}>
                <strong>Advanced Marathoning</strong> by Pete Pfitzinger and Scott Douglas
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                <strong>Daniels' Running Formula</strong> by Jack Daniels
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                <strong>Hansons Marathon Method</strong> by Luke Humphrey
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                <strong>80/20 Running</strong> by Matt Fitzgerald
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Our system analyzes your current fitness level, race goals, and available training time to create a personalized plan that balances:
            </Typography>
            <Box component="ul" sx={{ pl: 4, mb: 3 }}>
              <Typography component="li" sx={{ mb: 2 }}>
                Progressive overload and recovery
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                Aerobic and anaerobic development
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                Race-specific workouts
              </Typography>
              <Typography component="li" sx={{ mb: 2 }}>
                Injury prevention
              </Typography>
            </Box>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Race Type 比赛类型</InputLabel>
              <Select
                value={formData.raceType}
                onChange={handleInputChange('raceType')}
                label="Race Type 比赛类型"
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
              label="Target Time 目标时间"
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
            </Typography>
            
            <TextField
              fullWidth
              label="5K Time 5公里时间"
              value={formData.current5k}
              onChange={handleInputChange('current5k')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="10K Time 10公里时间"
              value={formData.current10k}
              onChange={handleInputChange('current10k')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Half Marathon Time 半马时间"
              value={formData.currentHalf}
              onChange={handleInputChange('currentHalf')}
              helperText="Format: HH:MM:SS"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Full Marathon Time 全马时间"
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
              <InputLabel>Training Duration 训练时长</InputLabel>
              <Select
                value={formData.trainingDuration}
                onChange={handleInputChange('trainingDuration')}
                label="Training Duration 训练时长"
              >
                {trainingDurations.map((duration) => (
                  <MenuItem key={duration.value} value={duration.value}>
                    {duration.label}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Select how long you want to train for your goal race
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Training Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 3
          }}
        >
          Training with Us
          和我们一起训练
        </Typography>

        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: '12px',
          p: { xs: 3, md: 6 },
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {renderStepContent(activeStep)}

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
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
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem'
                }}
              >
                Back 返回
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
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem'
                }}
              >
                Next 下一步
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
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem'
                }}
              >
                Generate Plan 生成计划
              </Button>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
} 