import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';

function NavText({ href, text }) {
  return (
    <Typography
      variant="subtitle1"
      noWrap
      sx={{
        fontFamily: 'Orbitron, monospace',
        fontWeight: 500,
        letterSpacing: '.05rem',
        color: '#FFFFFF',
        fontSize: '0.9rem',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        padding: '4px 12px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
        }
      }}
    >
      <NavLink
        to={href}
        style={{
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        {text}
      </NavLink>
    </Typography>
  );
}

export default function NavBar() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Top Banner */}
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          backgroundColor: '#D4B483',
          boxShadow: 'none',
          width: '100vw',
          left: 0,
          right: 0
        }}
      >
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 4 } }}>
          <Toolbar disableGutters sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            py: 1,
            minHeight: '48px'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <NavText href='/' text='纽约新蜂跑团 NewBee Running Club' />
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                component={NavLink}
                to="/dashboard"
                sx={{
                  color: 'white',
                  textTransform: 'none',
                  fontSize: '0.9rem',
                  minWidth: 'auto',
                  px: 3,
                  py: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                  }
                }}
              >
                Dashboard
              </Button>
              <Button
                component={NavLink}
                to="/profile"
                sx={{
                  color: 'white',
                  textTransform: 'none',
                  fontSize: '0.9rem',
                  minWidth: 'auto',
                  px: 3,
                  py: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                  }
                }}
              >
                Profile
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>
    </Box>
  );
}
