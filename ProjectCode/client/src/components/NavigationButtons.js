import { Box, Button, Container, Typography } from '@mui/material';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// Single source of truth for navigation buttons
export const navigationButtons = [
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
    english: 'Upcoming',
    chinese: '即将到来',
    path: '/calendar'
  },
  {
    english: 'Memories',
    chinese: '回忆',
    path: '/highlights'
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
    chinese: '我们的赞助者/赞助商',
    path: '/sponsors'
  }
];

/**
 * Unified navigation buttons component
 * @param {Object} props
 * @param {'filled' | 'outlined'} props.variant - Button style variant
 *   - 'filled': Solid orange background (used on HomePage)
 *   - 'outlined': Orange border with active state highlighting (used on other pages)
 */
export default function NavigationButtons({ variant = 'outlined' }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const isFilled = variant === 'filled';

  return (
    <Box sx={{
      position: 'sticky',
      top: { xs: '48px', sm: '64px' },
      zIndex: 1099,
      width: '100%',
      backgroundColor: '#FFFFFF',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      mb: { xs: 2, sm: 3 },
    }}>
      <Container maxWidth="xl" sx={{
        py: { xs: 1, sm: 1.5 },
        px: { xs: 1, sm: 2 },
        maxWidth: '1200px',
      }}>
        <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: isFilled ? 'center' : undefined,
          gap: { xs: 0.75, sm: 1.25 },
          width: '100%',
          px: isFilled ? undefined : { xs: 1, sm: 2 },
          ...(isFilled && {
            '& .MuiButton-root': {
              borderRadius: { xs: '8px', sm: '12px' },
              px: { xs: 1.5, sm: 2.5 },
              py: { xs: 0.75, sm: 1.75 },
              backgroundColor: '#FFB84D',
              color: '#FFFFFF',
              fontFamily: 'Roboto, sans-serif',
              fontSize: { xs: '12px', sm: '17px' },
              textTransform: 'none',
              transition: 'all 0.2s ease',
              border: 'none',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              whiteSpace: 'nowrap',
              margin: 0,
              minWidth: 'auto',
              flex: '0 1 auto',
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
          })
        }}
      >
        {navigationButtons.map((button, index) => {
          const isActive = currentPath === button.path;

          return (
            <Button
              key={index}
              component={Link}
              to={button.path}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 'fit-content',
                ...(isFilled ? {
                  '& .MuiTypography-root': {
                    width: '100%',
                    textAlign: 'center',
                    color: '#FFFFFF'
                  }
                } : {
                  borderRadius: { xs: '8px', sm: '12px' },
                  px: { xs: 1.5, sm: 2.5 },
                  py: { xs: 0.75, sm: 1.75 },
                  fontFamily: 'Roboto, sans-serif',
                  fontSize: { xs: '12px', sm: '17px' },
                  textTransform: 'none',
                  transition: 'all 0.2s ease',
                  border: '2px solid #FFB84D',
                  whiteSpace: 'nowrap',
                  margin: 0,
                  minWidth: 'auto',
                  flex: '0 1 auto',
                  backgroundColor: isActive ? '#FFB84D' : 'white',
                  color: isActive ? 'white' : '#FFB84D',
                  '&:hover': {
                    backgroundColor: isActive ? '#FFA833' : 'rgba(255, 184, 77, 0.1)',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                    transform: 'translateY(-2px)',
                  },
                  '&:active': {
                    backgroundColor: isActive ? '#FF9919' : 'rgba(255, 184, 77, 0.2)',
                    transform: 'translateY(1px) scale(0.98)',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                  }
                })
              }}
            >
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '11px', sm: '17px' },
                  lineHeight: 1.2,
                  mb: { xs: 0.25, sm: 0.5 },
                  color: isFilled ? undefined : 'inherit'
                }}
              >
                {button.english}
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: '10px', sm: '15px' },
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: isFilled ? undefined : 'inherit'
                }}
              >
                {button.chinese}
              </Typography>
            </Button>
          );
        })}
        </Box>
      </Container>
    </Box>
  );
}

// Backward-compatible exports
export const MainPageButtons = () => <NavigationButtons variant="filled" />;
export const PageButtons = () => <NavigationButtons variant="outlined" />;
