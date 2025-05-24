import { Box, Container, Typography } from '@mui/material';

const ClubEntryRules = () => {
  return (
    <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: '12px',
        p: { xs: 3, md: 6 },
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: '#333',
            mb: 3
          }}
        >
          新蜂跑团 Club Entry 名额分配规则（2025 年赛事）
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          为了鼓励更多跑友代表新蜂跑团参与 NYRR 官方赛事，展现团队风采、提升竞技表现，新蜂跑团获得了本次 4 个 NYRR Club Entry 名额。现根据跑团内部商议，公布名额申请与分配规则如下
        </Typography>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          一、什么是 Club Entry？
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          Club Entry 是 NYRR 面向注册俱乐部分配的官方参赛名额，通常适用于名额紧张、需抽签或成绩达标的热门赛事。该名额具有以下特点：
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 1 }}>无需抽签、直接参赛</Typography>
          <Typography component="li" sx={{ mb: 1 }}>需要由跑团统一提交报名信息</Typography>
          <Typography component="li" sx={{ mb: 1 }}>属于跑团整体参赛配额的一部分</Typography>
        </Box>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          因此，我们希望名额能优先分配给真正代表跑团参赛、有出勤和贡献的成员。
        </Typography>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          二、基本原则
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 2 }}>
            <strong>确保参赛，不浪费名额</strong>
            <br />
            报名即表示确认参赛计划，请勿临时退出或更改，以免资源浪费。
          </Typography>
          <Typography component="li" sx={{ mb: 2 }}>
            <strong>公开透明，兼顾多元考量</strong>
            <br />
            分配过程中将参考竞技成绩、活动参与度、历史获得情况等多维度指标，确保公平、公正。
          </Typography>
          <Typography component="li" sx={{ mb: 2 }}>
            <strong>鼓励轮换，优先未曾获名额者</strong>
            <br />
            我们希望通过合理轮换，让更多成员享受到 Club Entry 的参赛机会，增强团队凝聚力。
          </Typography>
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          三、分配规则与说明
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          每次比赛共分配 4 个 Club Entry 名额，将遵循如下机制进行遴选：
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          为让更多成员体验 Club Entry 参赛机会，我们将优先考虑过去 6 个月内未获得过此类名额的成员。
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
            fontStyle: 'italic'
          }}
        >
          说明：如候选人近期虽有过一次 Club Entry，但同时在积分榜、活动参与方面仍表现突出（如连续为跑团争分、组织活动、承担义工等），可作为特殊情况纳入评估，但不宜连续获得多场 Club Entry。
        </Typography>

        <Box component="ol" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 2 }}>
            <strong>竞技积分维度</strong>
            <br />
            参考 2024 年新蜂 NYRR 年度积分榜成绩，综合个人年度出勤情况与名次表现，排序择优。
            <br />
            <Typography component="span" sx={{ fontStyle: 'italic' }}>
              说明：如有并列或状态变化，管理组保留一定调整空间，以保证出赛代表性。
            </Typography>
          </Typography>

          <Typography component="li" sx={{ mb: 2 }}>
            <strong>活动参与维度</strong>
            <br />
            参考 Heylo 平台活动积分，包括平时参加跑团训练、担任啦啦队志愿者、协助组织活动等。
            <br />
            新成员如表现积极，亦可优先考虑。
          </Typography>

          <Typography component="li" sx={{ mb: 2 }}>
            <strong>历史 Club Entry 获得记录</strong>
            <br />
            若候选人中有未曾获得 Club Entry 的成员，将优先考虑，鼓励更多跑友获得首次出赛机会。
          </Typography>

          <Typography component="li" sx={{ mb: 2 }}>
            <strong>新人参与年限建议</strong>
            <br />
            我们鼓励新成员积极参与跑团活动，但基于名额稀缺性及参赛责任感，建议 Club Entry 申请者至少有六个月以上的新蜂参与记录（训练、积分赛或志愿活动）
            <br />
            "照顾新人"初衷是激励融入与参与。建议通过参加跑团活动、义工活动等方式加深参与感，并在次年进入 Club Entry 考量范围。
          </Typography>
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          四、报名方式
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          如有意申请本次名额，请于指定时间前发送以下信息至邮箱：
          <br />
          newbeerunningclub@gmail.com
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 1 }}>Legal Name（NYRR 注册姓名）</Typography>
          <Typography component="li" sx={{ mb: 1 }}>NYRR 注册邮箱</Typography>
          <Typography component="li" sx={{ mb: 1 }}>是否曾获得 Club Entry</Typography>
          <Typography component="li" sx={{ mb: 1 }}>Heylo 昵称（便于核对活动积分）</Typography>
        </Box>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          如有未入选成员，也可作为候补人选。若有放弃名额情况将自动递补。
        </Typography>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          六、补充说明
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 2 }}>
            若报名人数不足，管理组有权灵活分配剩余名额，冷冻期不计入再内；
          </Typography>
          <Typography component="li" sx={{ mb: 2 }}>
            获得名额后如有特殊原因需退出，请提前通知管理组，以便递补；
          </Typography>
          <Typography component="li" sx={{ mb: 2 }}>
            跑团保留在特殊情况下的名额调配权（如成员受伤、活动异常等）。
          </Typography>
        </Box>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
            fontWeight: 600
          }}
        >
          新蜂跑团管理组
        </Typography>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#333',
            mt: 4,
            mb: 2
          }}
        >
          📊 Heylo 积分系统说明
        </Typography>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          Heylo 积分由三部分组成：
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 1 }}>参赛积分：参加 NYRR 及其他跑团成员参与的重要赛事（每次 1 分）</Typography>
          <Typography component="li" sx={{ mb: 1 }}>义工积分：摄影、打卡、官方志愿者等（每次 1 分）</Typography>
          <Typography component="li" sx={{ mb: 1 }}>活动积分：参与训练营、团跑、Long Run（每次 1 分）</Typography>
        </Box>

        <Typography
          variant="body1"
          sx={{
            fontFamily: 'Roboto, sans-serif',
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#333',
            mb: 3,
          }}
        >
          积分采用 滚动制（Rolling Base）：
        </Typography>

        <Box component="ul" sx={{ pl: 4, mb: 3 }}>
          <Typography component="li" sx={{ mb: 1 }}>最近 6 个月积分按 1:1 计入</Typography>
          <Typography component="li" sx={{ mb: 1 }}>6~12 个月积分按 0.5:1 计入</Typography>
          <Typography component="li" sx={{ mb: 1 }}>超过 12 个月则不计分</Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default ClubEntryRules; 