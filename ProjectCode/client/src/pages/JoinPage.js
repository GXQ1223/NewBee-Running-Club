import {
    Box,
    Button,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Typography
} from '@mui/material';
import React, { useState } from 'react';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

const steps = ['Read Terms', 'Agree to Terms', 'Complete Questionnaire'];

export default function JoinPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    runningExperience: '',
    location: '',
    weeklyFrequency: '',
    monthlyMileage: '',
    raceExperience: '',
    goals: '',
    introduction: '',
  });

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleAgree = () => {
    setAgreed(true);
    setOpenDialog(false);
    handleNext();
  };

  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically send the form data to your backend
    console.log('Form submitted:', formData);
    // Reset form and show success message
    setFormData({
      name: '',
      runningExperience: '',
      location: '',
      weeklyFrequency: '',
      monthlyMileage: '',
      raceExperience: '',
      goals: '',
      introduction: '',
    });
    setActiveStep(0);
  };

  const renderTerms = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Welcome to NewBee Running Club! 欢迎加入新蜂跑团！
      </Typography>
      <Typography paragraph>
        😊 Hello, thank you for your interest in NewBee Running Club. We warmly welcome you to join us and grow together.
      </Typography>
      <Typography paragraph>
        😊 您好，谢谢您对新蜂跑团的关注，我们非常欢迎您加入新蜂跑团并且与我们共同成长。
      </Typography>

      <Typography paragraph>
        🎉 Our running group is called NewBee Running Club, including but not limited to running enthusiasts in the New York area. We are an officially registered running group with NYRR. Currently, we have over 500 members.
      </Typography>
      <Typography paragraph>
        🎉 我们的跑群名字叫做纽约新蜂跑团，包括但不限于纽约地区的爱好跑步的跑友，英文名字是NewBee Running Club。取义蜜蜂，是纽约路跑协会NYRR的官方注册跑团。现有跑团成员超过500人。
      </Typography>

      <Typography paragraph>
        💪 NewBee is committed to being a serious running organization, not just a WeChat interest group. Before joining, please read the following content. We hope you don't find this troublesome or unpleasant, as it helps us better understand and support your running journey, while also helping NewBee grow better.
      </Typography>
      <Typography paragraph>
        💪 新蜂致力于成为严肃的跑步组织，而不是微信兴趣小组，在加入之前，需要麻烦您阅读以下内容，希望您不要感到麻烦或者不快，因为这也是让我们更好地了解和帮助你的跑步，同时也是帮助新蜂更好地成长。
      </Typography>

      <Typography paragraph>
        🔄 Currently, due to WeChat group size limitations, NewBee Running Club has two WeChat groups. Our WeChat groups mainly serve as information distribution channels. All NewBee running activity information is shared across all groups, and core team members are present in all groups. For specific activities, we also create activity-specific small groups, so interaction between groups is easy.
      </Typography>
      <Typography paragraph>
        🔄 目前，由于微信群人数限制, 新蜂跑团已经有两个微信大群，我们的微信群主要是起到信息发布的作用, 所有的新蜂跑步活动信息都会在各个群共享, 核心团员也都在各个群里,每一次具体活动也还会拉活动小群, 所以各群之间互动是很容易的。
      </Typography>

      <Typography paragraph>
        📜 Rules are essential for creating a good environment. We hope that:
      </Typography>
      <Typography paragraph>
        📜 没有规矩不成方圆，为了给大家创造一个良好的交流环境，我们希望：
      </Typography>

      <Typography paragraph>
        👋 1. Every new member needs to prepare a self-introduction. The introduction should include: name, running experience (when you started running), usual running locations, weekly running frequency, average monthly mileage, race results from 10K to marathon; if you haven't participated in races, please describe your current running ability, such as how long it takes to complete 5K, and whether you plan to participate in races in the future. For beginners, please write about your short-term goals. Also, please state your main purpose for joining NewBee Running Club.
      </Typography>
      <Typography paragraph>
        👋 1. 每一位新入群的朋友都需要准备自我介绍。自我介绍要包括名字，跑龄（什么时候开始跑步的），平时在哪里跑步，每周跑步频次，每月跑量平均多少，已经参加过的跑步比赛成绩，从10公里到全马；如果还没有参加过比赛，需要说清楚自己目前的跑步能力，比如5公里需要多长时间跑完，未来是否计划参加比赛等，如果是刚开始跑的新人，可以写自己短期的目标是什么；另外，要说明自己加入新蜂跑团主要的诉求。
      </Typography>

      <Typography paragraph>
        📋 Good self-introduction examples (two examples, (1) for experienced runners, (2) for beginners):
      </Typography>
      <Typography paragraph>
        📋 好的自我介绍（两个例子，(1)为有经验的跑者，(2)为初跑者）可以参见：
      </Typography>

      <Typography paragraph sx={{ pl: 2 }}>
        (1) I am Lin Xue, previously lived in Santa Barbara, California, where I developed a running habit. I've been in New York for a year now, usually running near my workplace: Central Park, or near home (Jersey City). I run 5-7 times a week, following a training plan during marathon cycles, with varying daily distances - up to 20 miles for weekend long runs and 10 miles for weekday workouts, averaging about 60 miles per week. I take training seriously. I've been running for 5 years and have participated in many half/full marathons. My best half marathon time is 1:29, and full marathon is 3:10, and I'm still working to improve. I'm currently preparing for the 2023 New York Marathon and participating in NYRR's 9+1 program. I joined NewBee mainly to improve my running performance, seek more scientific training guidance, and train with friends of similar goals/levels. I hope to enjoy the happiness that running brings with everyone.
      </Typography>
      <Typography paragraph sx={{ pl: 2 }}>
        (1) 我是林雪，以前在加州圣巴巴拉生活，养成了跑步的习惯，现在来纽约一年了，平时跑步在工作地点附近：纽约中央公园，或者家附近（Jersey City）； 每周跑5-7次，在全马周期内时按计划跑，每天距离不固定，多的时候比如周末长距离20mile，周中workout跑10mile，平均每周在60mile左右，对待训练较为严肃；我的跑步训练已经5年了，参加过的半马/全马比赛很多；半马最好成绩1小时29分，全马最好成绩3小时10分钟，还在努力进步；目前正在准备2023年的纽约马拉松，也参加NYRR的9+1赛事；我加入新蜂主要为了提升自己的跑步成绩，寻求更科学的理论指导，与目标/水平相近的朋友一起训练，希望我能和大家一起享受跑步带来的快乐。
      </Typography>

      <Typography paragraph sx={{ pl: 2 }}>
        (2) I am Mango, been in New York for ten years but just started running recently, mainly inspired by a friend who qualified for the New York Marathon through the NYRR 9+1 program - I want to run the NYC Marathon too! I live in Midtown. As a beginner, I can only run twice a week now, about 3-5K each time. I hope to get more guidance from experienced runners in the group to improve faster. Also, my family is worried about knee problems from running too much, so I'd like to consult experienced runners about injury-free running. I haven't participated in any races yet, but plan to register for NYRR's Team Championships 5-mile next month. My fastest 5K is 33 minutes, which is slow but much better than when I started. I'm really excited to find this group and hope to have fun together! 😄😄😄
      </Typography>
      <Typography paragraph sx={{ pl: 2 }}>
        (2) 我是芒果，来纽约十年了，但最近才开始跑步，主要原因是受朋友参加NYRR 9+1项目得到参加纽约马拉松资格的事例的感染，我也想跑纽马！我住在Midtown。由于刚开始跑步，现在每周只能跑两次，每次大概3-5公里，希望进群之后能得到更多前辈的指点，让我能进步更快，而且我的家人比较担心我跑多了膝盖出问题，所以我也想多咨询前辈们如何能无伤跑步。我目前没有参加过任何比赛，但计划报名NYRR下个月的Team Championships 5mile；我跑过的5公里最快能跑到33分钟，很龟速，但已经比一开始进步很多了；找到组织真的很开心，好激动，希望可以一起愉快地玩耍～😄😄😄
      </Typography>

      <Typography paragraph>
        🤝 2. The group welcomes sharing running check-ins, running experiences, running routes, and organizing group runs. If you want to organize a run, please clearly state in the group chat the distance you want to run, start time, planned pace, and meeting location. Fellow runners will respond naturally.
      </Typography>
      <Typography paragraph>
        🤝 2. 本群欢迎分享跑步打卡、跑步心得体会、跑步路线，欢迎约跑，如想约跑，请在大群把自己想要跑的距离，开始时间，计划配速，集合地点说清楚，自然会有跑友响应的。
      </Typography>

      <Typography paragraph>
        🚫 3. Members who post inappropriate content, pornography, gambling, or virus links will be removed immediately. Posting baseless attacks, narrow nationalism, regional discrimination, and other negative content is prohibited and will result in immediate removal.
      </Typography>
      <Typography paragraph>
        🚫 3. 群内发布不良倾向、色情、赌博、病毒链接信息的跑友直接删除；禁止发布无端攻击，狭隘民族主义，地域歧视等负能量信息，直接删除。
      </Typography>

      <Typography paragraph>
        🔍 4. Verified charity, help, and mutual aid information is allowed to promote positive energy, but limited to one post and must be approved by the group admin in advance.
      </Typography>
      <Typography paragraph>
        🔍 4. 允许发布经过证实的慈善、求助、互助信息，弘扬正能量，但仅限一次，并事先获得群主审定。
      </Typography>

      <Typography paragraph>
        ❌ 5. Any form of spamming is prohibited. No voting, likes, or promotional information in the group. First offense will result in a warning, second offense will result in removal. Group chat is open, but please reduce ineffective communication. Any member using insulting language, personal attacks, profanity (especially involving family members, gender attacks, etc.), or amplifying private conflicts in public spaces will be warned or removed based on the severity of the situation.
      </Typography>
      <Typography paragraph>
        ❌ 5. 禁止各种形式的刷屏行为，禁止群内拉票、点赞、推广信息，一次警告，二次删除；群内聊天开放，但要减少无效交流信息。任何成员在新蜂群内使用侮辱性语言、人身攻击、粗口（特别涉及家庭成员、性别攻击等），或将私人冲突在公共空间无限放大者，将视情节严重程度予以警告或移出处理。
      </Typography>

      <Typography paragraph>
        📅 6. These rules take effect from the date of publication. Final interpretation rights belong to NewBee Running Club (NBRC, 纽约新蜂跑团).
      </Typography>
      <Typography paragraph>
        📅 6. 本制度自发布之日起执行，最终解释权归纽约NewBee Running Club (NBRC, 纽约新蜂跑团)所有。
      </Typography>

      <Typography paragraph>
        🏅 7. We pursue pure running happiness. Based on the borderless nature of the internet, through running activities, we share our professional skills within our capabilities to make running activities more interesting! Everyone is welcome to supervise the implementation of the above content.
      </Typography>
      <Typography paragraph>
        🏅 7. 我们追求纯粹的跑步快乐，我们基于互联网的无边界性，通过跑步活动，互相在力所能及的前提下，共享自己的专业技能，让跑步活动变得更加有趣！以上内容欢迎大家共同监督执行。
      </Typography>

      <Typography paragraph>
        📩 8. After reading the group notice, send your prepared self-introduction to the friend who introduced you to the group, and they will invite you to join. If their group is full, the introducer can help you contact the admin to join the new group.
      </Typography>
      <Typography paragraph>
        📩 8. 阅读群公告后，将准备好的自我介绍发给介绍你入群的朋友，由他邀请你入群。若其所在群已满，可以让介绍人协助你直接联系管理员进入新群。
      </Typography>

      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setOpenDialog(true)}
          sx={{ 
            backgroundColor: '#FFA500', 
            '&:hover': { backgroundColor: '#FF8C00' },
            minWidth: '200px'
          }}
        >
          I Agree 我同意
        </Button>
      </Box>
    </Box>
  );

  const renderQuestionnaire = () => (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <TextField
        fullWidth
        label="Name 姓名"
        name="name"
        value={formData.name}
        onChange={handleFormChange}
        margin="normal"
        required
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
      />
      <TextField
        fullWidth
        label="Running Location 跑步地点"
        name="location"
        value={formData.location}
        onChange={handleFormChange}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Weekly Running Frequency 每周跑步频次"
        name="weeklyFrequency"
        value={formData.weeklyFrequency}
        onChange={handleFormChange}
        margin="normal"
        required
      />
      <TextField
        fullWidth
        label="Monthly Mileage 每月跑量"
        name="monthlyMileage"
        value={formData.monthlyMileage}
        onChange={handleFormChange}
        margin="normal"
        required
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
        rows={4}
      />
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          type="submit"
          sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#FF8C00' } }}
        >
          Submit 提交
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Logo />
      <PageButtons />
      
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 3
          }}
        >
          Join NewBee Running Club
          加入新蜂跑团
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: 3 }}>
          {activeStep === 0 && (
            <>
              {renderTerms()}
            </>
          )}

          {activeStep === 1 && renderQuestionnaire()}
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