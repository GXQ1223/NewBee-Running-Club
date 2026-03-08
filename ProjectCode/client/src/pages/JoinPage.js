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
  Divider,
  Fade,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Step,
  StepLabel,
  Stepper,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import EventIcon from '@mui/icons-material/Event';
import React, { useEffect, useRef, useState } from 'react';
import NavigationButtons from '../components/NavigationButtons';
import { submitJoinApplication } from '../api/members';
import { submitActivity } from '../api/activities';

const steps = ['Read Terms', 'Complete Application', 'Record Activities', 'Complete'];

const locationOptions = [
  { value: 'manhattan', label: 'Manhattan 曼哈顿' },
  { value: 'brooklyn', label: 'Brooklyn 布鲁克林' },
  { value: 'queens', label: 'Queens 皇后区' },
  { value: 'bronx', label: 'Bronx 布朗克斯' },
  { value: 'staten-island', label: 'Staten Island 史坦顿岛' },
  { value: 'new-jersey', label: 'New Jersey 新泽西' },
  { value: 'long-island', label: 'Long Island 长岛' },
  { value: 'other', label: 'Other 其他' }
];

// Validation function for introduction
const validateIntroduction = (text) => {
  if (!text) return { valid: false, message: '', count: 0 };

  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;

  // Count English words (split by whitespace, filter empty)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  // Filter out words that are only Chinese characters
  const englishWords = words.filter(w => !/^[\u4e00-\u9fff]+$/.test(w)).length;

  // Check if meets minimum requirements
  const meetsChineseMin = chineseChars >= 480;
  const meetsEnglishMin = englishWords >= 120;

  if (meetsChineseMin || meetsEnglishMin) {
    return { valid: true, message: '', count: chineseChars > englishWords ? chineseChars : englishWords, type: chineseChars > englishWords ? 'chinese' : 'english' };
  }

  // Return which requirement is closer to being met
  const chineseProgress = chineseChars / 480;
  const englishProgress = englishWords / 120;

  if (chineseProgress > englishProgress) {
    return {
      valid: false,
      message: `${chineseChars}/480 Chinese characters. Need ${480 - chineseChars} more. / 中文字符 ${chineseChars}/480，还需要 ${480 - chineseChars} 个字符`,
      count: chineseChars,
      type: 'chinese'
    };
  } else {
    return {
      valid: false,
      message: `${englishWords}/120 English words. Need ${120 - englishWords} more. / 英文单词 ${englishWords}/120，还需要 ${120 - englishWords} 个单词`,
      count: englishWords,
      type: 'english'
    };
  }
};

export default function JoinPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [introValidation, setIntroValidation] = useState({ valid: true, message: '', count: 0 });
  const [locationSelect, setLocationSelect] = useState('');
  const [showOtherLocation, setShowOtherLocation] = useState(false);
  const termsContainerRef = useRef(null);

  // Member ID from submitted application (for activity submission)
  const [memberId, setMemberId] = useState(null);

  // Activity recording state
  const [activityTab, setActivityTab] = useState(0); // 0 = First Run, 1 = Second Run
  const [activity1, setActivity1] = useState({ event_name: '', event_date: '', description: '', submitted: false });
  const [activity2, setActivity2] = useState({ event_name: '', event_date: '', description: '', submitted: false });
  const [activitySubmitting, setActivitySubmitting] = useState(false);
  const [activityError, setActivityError] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    email: '',
    nyrr_id: '',
    runningExperience: '',
    location: '',
    weeklyFrequency: '',
    monthlyMileage: '',
    raceExperience: '',
    goals: '',
    introduction: '',
  });

  useEffect(() => {
    const handleScroll = () => {
      if (termsContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = termsContainerRef.current;
        // Consider scrolled to bottom when within 50px of the bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setHasScrolledToBottom(isAtBottom);
      }
    };

    const container = termsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleAgree = () => {
    setOpenDialog(false);
    handleNext();
  };

  const handleLocationSelectChange = (e) => {
    const value = e.target.value;
    setLocationSelect(value);

    if (value === 'other') {
      setShowOtherLocation(true);
      setFormData({
        ...formData,
        location: ''
      });
    } else {
      setShowOtherLocation(false);
      const selectedOption = locationOptions.find(opt => opt.value === value);
      setFormData({
        ...formData,
        location: selectedOption ? selectedOption.label : ''
      });
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    // Validate introduction as user types
    if (name === 'introduction') {
      const validation = validateIntroduction(value);
      setIntroValidation(validation);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate introduction before submission
    const validation = validateIntroduction(formData.introduction);
    if (!validation.valid) {
      setIntroValidation(validation);
      setSubmitError('Please complete your self-introduction with at least 120 English words or 480 Chinese characters. / 请完成您的自我介绍，至少120个英文单词或480个中文字符。');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      // Map form data to API format
      const applicationData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        nickname: formData.nickname || null,
        email: formData.email,
        nyrr_id: formData.nyrr_id || null,
        running_experience: formData.runningExperience,
        location: formData.location,
        weekly_frequency: formData.weeklyFrequency,
        monthly_mileage: formData.monthlyMileage,
        race_experience: formData.raceExperience || null,
        goals: formData.goals,
        introduction: formData.introduction,
      };

      const response = await submitJoinApplication(applicationData);

      // Store member ID for activity submission
      if (response.member_id) {
        setMemberId(response.member_id);
      }

      // Advance to activity recording step
      setActiveStep(2);

    } catch (error) {
      console.error('Error submitting application:', error);
      // Parse error details if available
      let errorMessage = 'Failed to submit application. Please try again. / 提交失败，请重试。';
      if (error.data?.detail) {
        errorMessage = error.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      setSubmitError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartOver = () => {
    setFormData({
      firstName: '',
      lastName: '',
      nickname: '',
      email: '',
      nyrr_id: '',
      runningExperience: '',
      location: '',
      weeklyFrequency: '',
      monthlyMileage: '',
      raceExperience: '',
      goals: '',
      introduction: '',
    });
    setLocationSelect('');
    setShowOtherLocation(false);
    setActiveStep(0);
    setSubmitError('');
    setIntroValidation({ valid: true, message: '', count: 0 });
    // Reset activity state
    setMemberId(null);
    setActivityTab(0);
    setActivity1({ event_name: '', event_date: '', description: '', submitted: false });
    setActivity2({ event_name: '', event_date: '', description: '', submitted: false });
    setActivityError('');
  };

  // Activity submission handlers
  const handleActivityChange = (activityNum) => (e) => {
    const { name, value } = e.target;
    if (activityNum === 1) {
      setActivity1(prev => ({ ...prev, [name]: value }));
    } else {
      setActivity2(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmitActivity = async (activityNum) => {
    if (!memberId) {
      setActivityError('Member ID not found. Please restart the application. / 未找到会员ID，请重新开始申请。');
      return;
    }

    const activity = activityNum === 1 ? activity1 : activity2;

    if (!activity.event_name || !activity.event_date) {
      setActivityError('Please fill in the event name and date. / 请填写活动名称和日期。');
      return;
    }

    setActivitySubmitting(true);
    setActivityError('');

    try {
      await submitActivity(memberId, {
        activity_number: activityNum,
        event_name: activity.event_name,
        event_date: activity.event_date,
        description: activity.description || null
      });

      // Mark activity as submitted
      if (activityNum === 1) {
        setActivity1(prev => ({ ...prev, submitted: true }));
        // Auto-switch to second activity tab
        setActivityTab(1);
      } else {
        setActivity2(prev => ({ ...prev, submitted: true }));
      }
    } catch (error) {
      console.error('Error submitting activity:', error);
      setActivityError(error.data?.detail || 'Failed to submit activity. Please try again. / 提交活动失败，请重试。');
    } finally {
      setActivitySubmitting(false);
    }
  };

  const handleFinishActivities = () => {
    setActiveStep(3);
  };

  const renderTerms = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Welcome to NewBee Running Club! 欢迎加入新蜂跑团！
      </Typography>

      <Box
        ref={termsContainerRef}
        sx={{
          height: '40vh',
          overflowY: 'auto',
          px: 2,
          mb: 3,
          border: '1px solid rgba(255, 165, 0, 0.2)',
          borderRadius: '8px',
          position: 'relative',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(255, 165, 0, 0.1)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255, 165, 0, 0.3)',
            borderRadius: '4px',
            '&:hover': {
              background: 'rgba(255, 165, 0, 0.4)',
            },
          },
        }}
      >
        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            Hello, thank you for your interest in NewBee Running Club. We warmly welcome you to join us and grow together.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            您好，谢谢您对新蜂跑团的关注，我们非常欢迎您加入新蜂跑团并且与我们共同成长。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            Our running group is called NewBee Running Club, including but not limited to running enthusiasts in the New York area. We are an officially registered running group with NYRR. Currently, we have over 500 members.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            我们的跑群名字叫做纽约新蜂跑团，包括但不限于纽约地区的爱好跑步的跑友，英文名字是NewBee Running Club。取义蜜蜂，是纽约路跑协会NYRR的官方注册跑团。现有跑团成员超过500人。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            NewBee is committed to being a serious running organization, not just a WeChat interest group. Before joining, please read the following content. We hope you don't find this troublesome or unpleasant, as it helps us better understand and support your running journey, while also helping NewBee grow better.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            新蜂致力于成为严肃的跑步组织，而不是微信兴趣小组，在加入之前，需要麻烦您阅读以下内容，希望您不要感到麻烦或者不快，因为这也是让我们更好地了解和帮助你的跑步，同时也是帮助新蜂更好地成长。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            Currently, due to WeChat group size limitations, NewBee Running Club has two WeChat groups. Our WeChat groups mainly serve as information distribution channels. All NewBee running activity information is shared across all groups, and core team members are present in all groups. For specific activities, we also create activity-specific small groups, so interaction between groups is easy.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            目前，由于微信群人数限制, 新蜂跑团已经有两个微信大群，我们的微信群主要是起到信息发布的作用, 所有的新蜂跑步活动信息都会在各个群共享, 核心团员也都在各个群里,每一次具体活动也还会拉活动小群, 所以各群之间互动是很容易的。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            Rules are essential for creating a good environment. We hope that:
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            没有规矩不成方圆，为了给大家创造一个良好的交流环境，我们希望：
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            1. Every new member needs to prepare a self-introduction. The introduction should include: name, running experience (when you started running), usual running locations, weekly running frequency, average monthly mileage, race results from 10K to marathon; if you haven't participated in races, please describe your current running ability, such as how long it takes to complete 5K, and whether you plan to participate in races in the future. For beginners, please write about your short-term goals. Also, please state your main purpose for joining NewBee Running Club.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            1. 每一位新入群的朋友都需要准备自我介绍。自我介绍要包括名字，跑龄（什么时候开始跑步的），平时在哪里跑步，每周跑步频次，每月跑量平均多少，已经参加过的跑步比赛成绩，从10公里到全马；如果还没有参加过比赛，需要说清楚自己目前的跑步能力，比如5公里需要多长时间跑完，未来是否计划参加比赛等，如果是刚开始跑的新人，可以写自己短期的目标是什么；另外，要说明自己加入新蜂跑团主要的诉求。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            Good self-introduction examples (two examples, (1) for experienced runners, (2) for beginners):
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            好的自我介绍（两个例子，(1)为有经验的跑者，(2)为初跑者）可以参见：
          </Typography>
        </Box>

        <Box sx={{ pl: 2, mb: 3 }}>
          <Typography paragraph>
            (1) I am Lin Xue, previously lived in Santa Barbara, California, where I developed a running habit. I've been in New York for a year now, usually running near my workplace: Central Park, or near home (Jersey City). I run 5-7 times a week, following a training plan during marathon cycles, with varying daily distances - up to 20 miles for weekend long runs and 10 miles for weekday workouts, averaging about 60 miles per week. I take training seriously. I've been running for 5 years and have participated in many half/full marathons. My best half marathon time is 1:29, and full marathon is 3:10, and I'm still working to improve. I'm currently preparing for the 2023 New York Marathon and participating in NYRR's 9+1 program. I joined NewBee mainly to improve my running performance, seek more scientific training guidance, and train with friends of similar goals/levels. I hope to enjoy the happiness that running brings with everyone.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            (1) 我是林雪，以前在加州圣巴巴拉生活，养成了跑步的习惯，现在来纽约一年了，平时跑步在工作地点附近：纽约中央公园，或者家附近（Jersey City）； 每周跑5-7次，在全马周期内时按计划跑，每天距离不固定，多的时候比如周末长距离20mile，周中workout跑10mile，平均每周在60mile左右，对待训练较为严肃；我的跑步训练已经5年了，参加过的半马/全马比赛很多；半马最好成绩1小时29分，全马最好成绩3小时10分钟，还在努力进步；目前正在准备2023年的纽约马拉松，也参加NYRR的9+1赛事；我加入新蜂主要为了提升自己的跑步成绩，寻求更科学的理论指导，与目标/水平相近的朋友一起训练，希望我能和大家一起享受跑步带来的快乐。
          </Typography>
        </Box>

        <Box sx={{ pl: 2, mb: 3 }}>
          <Typography paragraph>
            (2) I am Mango, been in New York for ten years but just started running recently, mainly inspired by a friend who qualified for the New York Marathon through the NYRR 9+1 program - I want to run the NYC Marathon too! I live in Midtown. As a beginner, I can only run twice a week now, about 3-5K each time. I hope to get more guidance from experienced runners in the group to improve faster. Also, my family is worried about knee problems from running too much, so I'd like to consult experienced runners about injury-free running. I haven't participated in any races yet, but plan to register for NYRR's Team Championships 5-mile next month. My fastest 5K is 33 minutes, which is slow but much better than when I started. I'm really excited to find this group and hope to have fun together!
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            (2) 我是芒果，来纽约十年了，但最近才开始跑步，主要原因是受朋友参加NYRR 9+1项目得到参加纽约马拉松资格的事例的感染，我也想跑纽马！我住在Midtown。由于刚开始跑步，现在每周只能跑两次，每次大概3-5公里，希望进群之后能得到更多前辈的指点，让我能进步更快，而且我的家人比较担心我跑多了膝盖出问题，所以我也想多咨询前辈们如何能无伤跑步。我目前没有参加过任何比赛，但计划报名NYRR下个月的Team Championships 5mile；我跑过的5公里最快能跑到33分钟，很龟速，但已经比一开始进步很多了；找到组织真的很开心，好激动，希望可以一起愉快地玩耍～
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            2. The group welcomes sharing running check-ins, running experiences, running routes, and organizing group runs. If you want to organize a run, please clearly state in the group chat the distance you want to run, start time, planned pace, and meeting location. Fellow runners will respond naturally.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            2. 本群欢迎分享跑步打卡、跑步心得体会、跑步路线，欢迎约跑，如想约跑，请在大群把自己想要跑的距离，开始时间，计划配速，集合地点说清楚，自然会有跑友响应的。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            3. Members who post inappropriate content, pornography, gambling, or virus links will be removed immediately. Posting baseless attacks, narrow nationalism, regional discrimination, and other negative content is prohibited and will result in immediate removal.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            3. 群内发布不良倾向、色情、赌博、病毒链接信息的跑友直接删除；禁止发布无端攻击，狭隘民族主义，地域歧视等负能量信息，直接删除。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            4. Verified charity, help, and mutual aid information is allowed to promote positive energy, but limited to one post and must be approved by the group admin in advance.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            4. 允许发布经过证实的慈善、求助、互助信息，弘扬正能量，但仅限一次，并事先获得群主审定。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            5. Any form of spamming is prohibited. No voting, likes, or promotional information in the group. First offense will result in a warning, second offense will result in removal. Group chat is open, but please reduce ineffective communication. Any member using insulting language, personal attacks, profanity (especially involving family members, gender attacks, etc.), or amplifying private conflicts in public spaces will be warned or removed based on the severity of the situation.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            5. 禁止各种形式的刷屏行为，禁止群内拉票、点赞、推广信息，一次警告，二次删除；群内聊天开放，但要减少无效交流信息。任何成员在新蜂群内使用侮辱性语言、人身攻击、粗口（特别涉及家庭成员、性别攻击等），或将私人冲突在公共空间无限放大者，将视情节严重程度予以警告或移出处理。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            6. These rules take effect from the date of publication. Final interpretation rights belong to NewBee Running Club (NBRC, 纽约新蜂跑团).
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            6. 本制度自发布之日起执行，最终解释权归纽约NewBee Running Club (NBRC, 纽约新蜂跑团)所有。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            7. We pursue pure running happiness. Based on the borderless nature of the internet, through running activities, we share our professional skills within our capabilities to make running activities more interesting! Everyone is welcome to supervise the implementation of the above content.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            7. 我们追求纯粹的跑步快乐，我们基于互联网的无边界性，通过跑步活动，互相在力所能及的前提下，共享自己的专业技能，让跑步活动变得更加有趣！以上内容欢迎大家共同监督执行。
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography paragraph>
            8. After reading the group notice, send your prepared self-introduction to the friend who introduced you to the group, and they will invite you to join. If their group is full, the introducer can help you contact the admin to join the new group.
          </Typography>
          <Typography paragraph sx={{ color: 'text.secondary' }}>
            8. 阅读群公告后，将准备好的自我介绍发给介绍你入群的朋友，由他邀请你入群。若其所在群已满，可以让介绍人协助你直接联系管理员进入新群。
          </Typography>
        </Box>

        <Fade in={!hasScrolledToBottom}>
          <Box
            sx={{
              position: 'sticky',
              bottom: 0,
              left: 0,
              right: 0,
              p: 2,
              background: 'linear-gradient(transparent, rgba(255, 255, 255, 0.9))',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Please scroll to the bottom to continue
              <br />
              请滚动到底部继续
            </Typography>
          </Box>
        </Fade>
      </Box>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setOpenDialog(true)}
          disabled={!hasScrolledToBottom}
          sx={{
            backgroundColor: '#FFA500',
            '&:hover': { backgroundColor: '#FF8C00' },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(255, 165, 0, 0.3)',
              color: 'rgba(255, 255, 255, 0.7)',
            },
            minWidth: '200px',
            transition: 'all 0.3s ease',
          }}
        >
          I Agree 我同意
        </Button>
      </Box>
    </Box>
  );

  const renderSuccessMessage = () => (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <CheckCircleIcon sx={{ fontSize: 80, color: '#4CAF50', mb: 3 }} />
      <Typography variant="h4" gutterBottom sx={{ color: '#4CAF50' }}>
        Application Submitted!
      </Typography>
      <Typography variant="h5" gutterBottom sx={{ color: '#4CAF50' }}>
        申请已提交！
      </Typography>
      <Typography variant="body1" sx={{ mt: 3, mb: 2 }}>
        Thank you for your interest in NewBee Running Club! Your application has been received.
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        感谢您对新蜂跑团的关注！您的申请已收到。
      </Typography>

      {/* Activity submission status */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 3 }}>
        <Chip
          icon={activity1.submitted ? <CheckCircleIcon /> : <EventIcon />}
          label={`First Run: ${activity1.submitted ? 'Submitted' : 'Not submitted'}`}
          color={activity1.submitted ? 'success' : 'warning'}
          variant="filled"
        />
        <Chip
          icon={activity2.submitted ? <CheckCircleIcon /> : <EventIcon />}
          label={`Second Run: ${activity2.submitted ? 'Submitted' : 'Not submitted'}`}
          color={activity2.submitted ? 'success' : 'warning'}
          variant="filled"
        />
      </Box>

      {(!activity1.submitted || !activity2.submitted) && (
        <Alert severity="info" sx={{ mb: 3, textAlign: 'left', maxWidth: 500, mx: 'auto' }}>
          <Typography variant="body2">
            Note: You haven't submitted all required activities yet. Your application will be reviewed, but approval may be delayed until activities are verified.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            注意：您尚未提交所有必需的活动。您的申请将被审核，但批准可能会延迟，直到活动得到验证。
          </Typography>
        </Alert>
      )}

      <Typography variant="body2" sx={{ mb: 1 }}>
        You will receive a confirmation email shortly at: <strong>{formData.email}</strong>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        您将很快收到确认邮件至: <strong>{formData.email}</strong>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Our team will review your application and get back to you within 1-3 business days.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        我们的团队将审核您的申请，并在1-3个工作日内回复您。
      </Typography>
      <Button
        variant="outlined"
        onClick={handleStartOver}
        sx={{
          color: '#FFA500',
          borderColor: '#FFA500',
          '&:hover': {
            borderColor: '#FF8C00',
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
          },
        }}
      >
        Submit Another Application / 提交另一份申请
      </Button>
    </Box>
  );

  const renderQuestionnaire = () => (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <TextField
          fullWidth
          label="NYRR First Name / NYRR注册名"
          name="firstName"
          value={formData.firstName}
          onChange={handleFormChange}
          margin="normal"
          required
          disabled={submitting}
        />
        <TextField
          fullWidth
          label="NYRR Last Name / NYRR注册姓"
          name="lastName"
          value={formData.lastName}
          onChange={handleFormChange}
          margin="normal"
          required
          disabled={submitting}
        />
      </Box>
      <TextField
        fullWidth
        label="Nickname (Website Display Name) / 昵称（网站显示名）"
        name="nickname"
        value={formData.nickname}
        onChange={handleFormChange}
        margin="normal"
        disabled={submitting}
        helperText="Optional. This name will be shown on the website instead of your NYRR name. / 可选。此名称将显示在网站上，替代NYRR注册名。"
      />
      <TextField
        fullWidth
        label="Email 电子邮箱"
        name="email"
        type="email"
        value={formData.email}
        onChange={handleFormChange}
        margin="normal"
        required
        disabled={submitting}
      />
      <TextField
        fullWidth
        label="NYRR Runner ID (Optional) NYRR跑者ID（可选）"
        name="nyrr_id"
        value={formData.nyrr_id}
        onChange={handleFormChange}
        margin="normal"
        disabled={submitting}
        helperText="You can find your NYRR ID on the NYRR website 您可以在NYRR网站上找到您的ID"
      />
      <TextField
        fullWidth
        label="Running Experience 跑龄"
        name="runningExperience"
        value={formData.runningExperience}
        onChange={handleFormChange}
        margin="normal"
        required
        multiline
        rows={2}
        disabled={submitting}
      />

      {/* Location Dropdown */}
      <FormControl fullWidth margin="normal" required>
        <InputLabel>Running Location 跑步地点</InputLabel>
        <Select
          value={locationSelect}
          onChange={handleLocationSelectChange}
          label="Running Location 跑步地点"
          disabled={submitting}
        >
          {locationOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Other Location Text Field */}
      {showOtherLocation && (
        <TextField
          fullWidth
          label="Please specify your location 请说明您的位置"
          name="location"
          value={formData.location}
          onChange={handleFormChange}
          margin="normal"
          required
          disabled={submitting}
        />
      )}

      <TextField
        fullWidth
        label="Weekly Running Frequency 每周跑步频次"
        name="weeklyFrequency"
        value={formData.weeklyFrequency}
        onChange={handleFormChange}
        margin="normal"
        required
        disabled={submitting}
      />
      <TextField
        fullWidth
        label="Monthly Mileage 每月跑量"
        name="monthlyMileage"
        value={formData.monthlyMileage}
        onChange={handleFormChange}
        margin="normal"
        required
        disabled={submitting}
      />
      <TextField
        fullWidth
        label="Race Experience 比赛经验"
        name="raceExperience"
        value={formData.raceExperience}
        onChange={handleFormChange}
        margin="normal"
        multiline
        rows={3}
        disabled={submitting}
      />
      <TextField
        fullWidth
        label="Running Goals 跑步目标"
        name="goals"
        value={formData.goals}
        onChange={handleFormChange}
        margin="normal"
        required
        multiline
        rows={2}
        disabled={submitting}
      />
      <TextField
        fullWidth
        label="Self Introduction 自我介绍"
        name="introduction"
        value={formData.introduction}
        onChange={handleFormChange}
        margin="normal"
        required
        multiline
        rows={6}
        disabled={submitting}
        error={!introValidation.valid && formData.introduction.length > 0}
        helperText={
          formData.introduction.length > 0
            ? (introValidation.valid
                ? `Valid! ${introValidation.type === 'chinese' ? `${introValidation.count} Chinese characters` : `${introValidation.count} English words`} / 有效！${introValidation.type === 'chinese' ? `${introValidation.count} 个中文字符` : `${introValidation.count} 个英文单词`}`
                : introValidation.message)
            : 'Minimum 120 English words OR 480 Chinese characters required. / 至少需要120个英文单词或480个中文字符。'
        }
      />
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          type="submit"
          disabled={submitting || !introValidation.valid}
          sx={{
            backgroundColor: '#FFA500',
            '&:hover': { backgroundColor: '#FF8C00' },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(255, 165, 0, 0.3)',
              color: 'rgba(255, 255, 255, 0.7)',
            },
          }}
        >
          {submitting ? <CircularProgress size={24} color="inherit" /> : 'Submit 提交'}
        </Button>
      </Box>
    </Box>
  );

  const renderActivities = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ color: '#FFA500' }}>
        Record Your Two Offline Runs with NewBee
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        记录您与新蜂的两次线下跑步活动
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Before your membership can be approved, you need to participate in at least 2 offline running activities with NewBee members. Record your activities below.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          在您的会员资格获得批准之前，您需要参加至少2次与新蜂成员的线下跑步活动。请在下方记录您的活动。
        </Typography>
      </Alert>

      {activityError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {activityError}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activityTab} onChange={(e, v) => setActivityTab(v)}>
          <Tab
            icon={activity1.submitted ? <CheckCircleIcon color="success" /> : <DirectionsRunIcon />}
            iconPosition="start"
            label={`First Run ${activity1.submitted ? '(Submitted)' : ''}`}
            disabled={activity1.submitted}
          />
          <Tab
            icon={activity2.submitted ? <CheckCircleIcon color="success" /> : <DirectionsRunIcon />}
            iconPosition="start"
            label={`Second Run ${activity2.submitted ? '(Submitted)' : ''}`}
            disabled={activity2.submitted}
          />
        </Tabs>
      </Box>

      {/* First Activity Tab */}
      <Box sx={{ display: activityTab === 0 ? 'block' : 'none' }}>
        {activity1.submitted ? (
          <Card sx={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="h6">Activity 1 Submitted</Typography>
              </Box>
              <Typography variant="body2"><strong>Event:</strong> {activity1.event_name}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {activity1.event_date}</Typography>
              {activity1.description && (
                <Typography variant="body2"><strong>Description:</strong> {activity1.description}</Typography>
              )}
            </CardContent>
          </Card>
        ) : (
          <Box>
            <TextField
              fullWidth
              label="Event Name / 活动名称"
              name="event_name"
              value={activity1.event_name}
              onChange={handleActivityChange(1)}
              margin="normal"
              required
              disabled={activitySubmitting}
              placeholder="e.g., Saturday Central Park Group Run"
            />
            <TextField
              fullWidth
              label="Event Date / 活动日期"
              name="event_date"
              type="date"
              value={activity1.event_date}
              onChange={handleActivityChange(1)}
              margin="normal"
              required
              disabled={activitySubmitting}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              label="Description (Optional) / 描述（可选）"
              name="description"
              value={activity1.description}
              onChange={handleActivityChange(1)}
              margin="normal"
              multiline
              rows={2}
              disabled={activitySubmitting}
              placeholder="Who did you run with? What was the route?"
            />
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => handleSubmitActivity(1)}
                disabled={activitySubmitting || !activity1.event_name || !activity1.event_date}
                sx={{
                  backgroundColor: '#FFA500',
                  '&:hover': { backgroundColor: '#FF8C00' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(255, 165, 0, 0.3)' },
                }}
              >
                {activitySubmitting ? <CircularProgress size={24} color="inherit" /> : 'Submit First Run / 提交第一次跑步'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Second Activity Tab */}
      <Box sx={{ display: activityTab === 1 ? 'block' : 'none' }}>
        {activity2.submitted ? (
          <Card sx={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', p: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="h6">Activity 2 Submitted</Typography>
              </Box>
              <Typography variant="body2"><strong>Event:</strong> {activity2.event_name}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {activity2.event_date}</Typography>
              {activity2.description && (
                <Typography variant="body2"><strong>Description:</strong> {activity2.description}</Typography>
              )}
            </CardContent>
          </Card>
        ) : (
          <Box>
            <TextField
              fullWidth
              label="Event Name / 活动名称"
              name="event_name"
              value={activity2.event_name}
              onChange={handleActivityChange(2)}
              margin="normal"
              required
              disabled={activitySubmitting}
              placeholder="e.g., Wednesday Track Workout"
            />
            <TextField
              fullWidth
              label="Event Date / 活动日期"
              name="event_date"
              type="date"
              value={activity2.event_date}
              onChange={handleActivityChange(2)}
              margin="normal"
              required
              disabled={activitySubmitting}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              label="Description (Optional) / 描述（可选）"
              name="description"
              value={activity2.description}
              onChange={handleActivityChange(2)}
              margin="normal"
              multiline
              rows={2}
              disabled={activitySubmitting}
              placeholder="Who did you run with? What was the route?"
            />
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => handleSubmitActivity(2)}
                disabled={activitySubmitting || !activity2.event_name || !activity2.event_date}
                sx={{
                  backgroundColor: '#FFA500',
                  '&:hover': { backgroundColor: '#FF8C00' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(255, 165, 0, 0.3)' },
                }}
              >
                {activitySubmitting ? <CircularProgress size={24} color="inherit" /> : 'Submit Second Run / 提交第二次跑步'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Summary and Finish */}
      <Divider sx={{ my: 3 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            icon={activity1.submitted ? <CheckCircleIcon /> : <EventIcon />}
            label={`First Run: ${activity1.submitted ? 'Submitted' : 'Pending'}`}
            color={activity1.submitted ? 'success' : 'default'}
            variant={activity1.submitted ? 'filled' : 'outlined'}
          />
          <Chip
            icon={activity2.submitted ? <CheckCircleIcon /> : <EventIcon />}
            label={`Second Run: ${activity2.submitted ? 'Submitted' : 'Pending'}`}
            color={activity2.submitted ? 'success' : 'default'}
            variant={activity2.submitted ? 'filled' : 'outlined'}
          />
        </Box>
        <Button
          variant="contained"
          onClick={handleFinishActivities}
          sx={{
            backgroundColor: '#4CAF50',
            '&:hover': { backgroundColor: '#45a049' },
          }}
        >
          {activity1.submitted && activity2.submitted
            ? 'Finish Application / 完成申请'
            : 'Skip for Now / 暂时跳过'}
        </Button>
      </Box>
      {(!activity1.submitted || !activity2.submitted) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
          You can submit activities later, but your application may take longer to process.
          <br />
          您可以稍后提交活动，但您的申请处理时间可能会更长。
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <NavigationButtons />

      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 3,
            textAlign: 'center'
          }}
        >
          Join NewBee Running Club
          <br />
          加入新蜂跑团
        </Typography>

        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{
            mb: 4,
            '& .MuiStepLabel-label': {
              fontSize: { xs: '0.65rem', sm: '0.875rem' },
              mt: { xs: 0.5, sm: 1 }
            },
            '& .MuiStepIcon-root': {
              fontSize: { xs: '1.2rem', sm: '1.5rem' }
            }
          }}
        >
          {steps.map((label, index) => (
            <Step key={label} completed={index < activeStep}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: 3 }}>
          {/* Step 0: Read Terms */}
          {activeStep === 0 && renderTerms()}

          {/* Step 1: Complete Application */}
          {activeStep === 1 && renderQuestionnaire()}

          {/* Step 2: Record Activities */}
          {activeStep === 2 && renderActivities()}

          {/* Step 3: Complete / Success */}
          {activeStep === 3 && renderSuccessMessage()}
        </Paper>
      </Container>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Confirm Agreement 确认同意</DialogTitle>
        <DialogContent>
          <Typography>
            By clicking "Agree", you confirm that you have read and understood all the terms and conditions of joining NewBee Running Club.
          </Typography>
          <Typography sx={{ mt: 2 }}>
            点击"同意"即表示您已阅读并理解加入新蜂跑团的所有条款和条件。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel 取消</Button>
          <Button onClick={handleAgree} variant="contained" color="primary">
            Agree 同意
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
