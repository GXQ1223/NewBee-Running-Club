import { Box, Button, Container, Typography } from '@mui/material';
import React from 'react';
import { Link } from 'react-router-dom';

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
    chinese: '俱乐部积分/志愿者记录',
    path: '/records'
  },
  {
    english: 'Join NewBee',
    chinese: '加入新蜂',
    path: '/join'
  },
  {
    english: 'Our Sponsors/Donors',
    chinese: '我们的捐助者/赞助商',
    path: '/sponsors'
  }
];

export default function MainPageButtons() {
  return (
    <Container maxWidth="xl" sx={{ 
      py: 1,
      px: 2,
      backgroundColor: '#FFFFFF',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    }}>
      <Box sx={{ 
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        '& .MuiButton-root': {
          borderRadius: '12px',
          px: 4.5,
          py: 1.5,
          backgroundColor: '#FFB84D',
          color: '#FFFFFF',
          fontFamily: 'Roboto, sans-serif',
          fontSize: '16px',
          textTransform: 'none',
          transition: 'all 0.2s ease',
          border: 'none',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          whiteSpace: 'nowrap',
          margin: 0,
          minWidth: 'auto',
          '&:hover': {
            backgroundColor: '#FFA833',
            border: 'none',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
            transform: 'translateY(-2px)',
          },
          '&:active': {
            backgroundColor: '#FF9919',
            transform: 'translateY(1px) scale(0.98)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
          }
        }
      }}>
        {buttons.map((button, index) => (
          <Button
            key={index}
            component={Link}
            to={button.path}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              '& .MuiTypography-root': {
                width: '100%',
                textAlign: 'center',
                color: '#FFFFFF'
              }
            }}
          >
            <Typography 
              sx={{ 
                fontWeight: 700,
                fontSize: '16px',
                lineHeight: 1.2,
                mb: 0.5
              }}
            >
              {button.english}
            </Typography>
            <Typography 
              sx={{ 
                fontSize: '14px',
                fontWeight: 700,
                lineHeight: 1.2
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