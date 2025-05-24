import { Box, Button, Container, Typography } from '@mui/material';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const buttons = [
  {
    english: 'NewBee Running Club',
    chinese: '纽约新蜂跑团',
    path: '/'
  },
  {
    english: 'About Us',
    chinese: '关于我们',
    path: '/about'
  },
  {
    english: 'Highlights',
    chinese: '活动高光',
    path: '/highlights'
  },
  {
    english: 'Events Calendar',
    chinese: '年度活动日历',
    path: '/calendar'
  },
  {
    english: 'Club Credits/Records',
    chinese: '俱乐部积分',
    path: '/records'
  },
  {
    english: 'Join NewBee',
    chinese: '加入新蜂',
    path: '/join'
  },
  {
    english: 'Training With Us',
    chinese: '与我们训练',
    path: '/training'
  },
  {
    english: 'Our Sponsors/Donors',
    chinese: '我们的捐助者/赞助商',
    path: '/sponsors'
  }
];

export default function PageButtons() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <Container maxWidth="xl" sx={{ 
      py: 1,
      px: 2,
      backgroundColor: '#FFFFFF',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
      maxWidth: '1200px',
    }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
        
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 1.25,
          width: '100%',
          px: { xs: 1, sm: 2 },
        }}
      >
        {buttons.map((button, index) => (
          <Button
            key={index}
            component={Link}
            to={button.path}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 'fit-content',
              borderRadius: '12px',
              px: { xs: 1, sm: 2.1 }, //very important, changes the width of the whole button row
              py: { xs: 1, sm: 1.75 },
              fontFamily: 'Roboto, sans-serif',
              fontSize: { xs: '13px', sm: '17px' },
              textTransform: 'none',
              transition: 'all 0.2s ease',
              border: '2px solid #FFB84D',
              whiteSpace: 'nowrap',
              margin: 0,
              minWidth: 'auto',
              flex: '0 1 auto',
              backgroundColor: currentPath === button.path ? '#FFB84D' : 'white',
              color: currentPath === button.path ? 'white' : '#FFB84D',
              '&:hover': {
                backgroundColor: currentPath === button.path ? '#FFA833' : 'rgba(255, 184, 77, 0.1)',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                transform: 'translateY(-2px)',
              },
              '&:active': {
                backgroundColor: currentPath === button.path ? '#FF9919' : 'rgba(255, 184, 77, 0.2)',
                transform: 'translateY(1px) scale(0.98)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }
            }}
          >
            <Typography 
              sx={{ 
                fontWeight: 700,
                fontSize: { xs: '13px', sm: '17px' },
                lineHeight: 1.2,
                mb: 0.5,
                color: 'inherit'
              }}
            >
              {button.english}
            </Typography>
            <Typography 
              sx={{ 
                fontSize: { xs: '11px', sm: '15px' },
                fontWeight: 700,
                lineHeight: 1.2,
                color: 'inherit'
              }}
            >
              {button.chinese}
            </Typography>
          </Button>
        ))}
      </Box>
    </Container>
  );
} 