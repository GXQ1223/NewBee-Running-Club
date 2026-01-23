import { AppBar, Badge, Box, Button, Container, IconButton, SvgIcon, Switch, Toolbar, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PersonIcon from '@mui/icons-material/Person';
import InstagramIcon from '@mui/icons-material/Instagram';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAdmin, useAuth, useSocialLinks } from '../context';
import { getPendingMembers } from '../api/members';

// Custom Xiaohongshu (Red Notes) icon
const XiaohongshuIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z" />
  </SvgIcon>
);

// Custom Heylo icon (community symbol)
const HeyloIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 38 34">
    <path d="M36.3458 19.2119C36.1042 19.6189 35.7608 19.9559 35.3539 20.2039C33.5607 21.3103 31.7103 21.2467 30.3178 20.4646L30.286 20.4455L30.1334 20.3565L26.4898 18.2136V19.9304C26.4898 21.2594 27.0176 22.5312 27.946 23.4786C28.0731 23.6058 28.194 23.733 28.3211 23.8601C29.7455 25.329 30.0698 27.3701 29.2622 29.1696C28.4674 30.9374 26.7887 31.9738 24.8302 31.9039C22.5792 31.8276 20.6334 30.1425 20.3918 27.8343C20.3473 27.421 20.3282 27.014 20.3282 26.6007H20.341V19.7715H17.009V26.6007H17.0153C17.0153 27.014 17.0026 27.421 16.9581 27.8343C16.7165 30.1425 14.7644 31.8276 12.5197 31.9039C10.5613 31.9738 8.88256 30.9374 8.08772 29.1696C7.27381 27.3701 7.60446 25.329 9.02881 23.8601C9.0924 23.7965 9.14962 23.7393 9.21321 23.6757C10.1352 22.7283 10.6566 21.4629 10.6566 20.1403V18.2263L7.03853 20.3565L6.88592 20.4455L6.85413 20.4646C6.19283 20.8334 5.42978 21.0432 4.61587 21.0432C1.17581 21.0432 -1.38675 17.2789 0.826077 13.648C1.07407 13.2411 1.4238 12.8914 1.83711 12.6434C3.62391 11.5433 5.46793 11.6133 6.85413 12.3954L6.88592 12.4145L7.03853 12.4971L10.6566 14.6273V12.7197C10.6566 11.3971 10.1352 10.1317 9.21321 9.18423L9.02881 8.99983C7.60446 7.53096 7.27381 5.48982 8.08772 3.68395C8.88256 1.92259 10.5613 0.886116 12.5197 0.949703C14.7644 1.02601 16.7165 2.71742 16.9581 5.02563C17.0217 5.63607 17.0217 6.25287 17.009 6.86966V13.7053H20.341V6.86966H20.3346C20.3219 6.25287 20.3346 5.63607 20.3918 5.02563C20.6334 2.71742 22.5792 1.02601 24.8302 0.949703C26.7887 0.886116 28.4674 1.92259 29.2622 3.68395C30.0698 5.48982 29.7455 7.53096 28.3211 8.99983C28.194 9.127 28.0731 9.25417 27.946 9.38135C27.0176 10.3288 26.4898 11.6005 26.4898 12.9295V14.6464L30.1334 12.5035L30.286 12.4081L30.3178 12.3954C30.9791 12.0202 31.7421 11.8167 32.556 11.8167C35.9961 11.8167 38.5586 15.5811 36.3458 19.2119Z" />
  </SvgIcon>
);

export default function NavBar() {
  const { isAdmin, adminModeEnabled, toggleAdminMode, memberData } = useAdmin();
  const { currentUser } = useAuth();
  const { socialLinks } = useSocialLinks();
  const navigate = useNavigate();
  // Check if user is full admin (status === 'admin') vs committee member
  const isFullAdmin = memberData?.status === 'admin';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [pendingCount, setPendingCount] = useState(0);

  // Helper to check if a social link is configured
  const hasLink = (link) => link && link.trim() !== '' && link !== '#';

  // Handle social link click - navigate to settings if admin mode enabled and link empty
  const handleSocialClick = (link, event) => {
    if (!hasLink(link)) {
      event.preventDefault();
      if (adminModeEnabled) {
        navigate('/admin?tab=settings');
      }
    }
  };

  // Fetch pending applications count for admins
  useEffect(() => {
    const fetchPendingCount = async () => {
      if (isAdmin && currentUser?.uid) {
        try {
          const pendingMembers = await getPendingMembers(currentUser.uid);
          setPendingCount(pendingMembers?.length || 0);
        } catch (error) {
          console.error('Error fetching pending members:', error);
          setPendingCount(0);
        }
      }
    };

    fetchPendingCount();
    // Refresh count every 30 seconds
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, currentUser?.uid]);

  return (
    <Box sx={{
      flexGrow: 1,
      position: 'sticky',
      top: 0,
      zIndex: 1100,
    }}>
      {/* Top Banner */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          backgroundColor: '#e98f4bff',
          boxShadow: 'none',
          width: '100%',
        }}
      >
        <Container maxWidth={false} sx={{ px: { xs: 1, sm: 2, md: 4 } }}>
          <Toolbar disableGutters sx={{
            display: 'flex',
            justifyContent: 'space-between',
            py: 1,
            minHeight: '48px'
          }}>
            {/* Logo and Social Icons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
              <NavLink to="/">
                <Box
                  component="img"
                  src="/PageLogo.png"
                  alt="NewBee Running Club Logo"
                  sx={{
                    height: { xs: '32px', sm: '40px' },
                    width: 'auto',
                    objectFit: 'contain',
                    cursor: 'pointer',
                    display: 'block',
                    filter: 'invert(1)',
                    mixBlendMode: 'screen'
                  }}
                />
              </NavLink>
              {/* Social Media Icons */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.25, sm: 0.5 } }}>
                <Tooltip title={hasLink(socialLinks.instagram) ? "Instagram" : (adminModeEnabled ? "Instagram (Click to configure)" : "Instagram (Not configured)")}>
                  <span>
                    <IconButton
                      href={hasLink(socialLinks.instagram) ? socialLinks.instagram : '#'}
                      target={hasLink(socialLinks.instagram) ? "_blank" : undefined}
                      onClick={(e) => handleSocialClick(socialLinks.instagram, e)}
                      disabled={!hasLink(socialLinks.instagram) && !adminModeEnabled}
                      sx={{
                        color: hasLink(socialLinks.instagram) ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
                        padding: { xs: '4px', sm: '6px' },
                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                        '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.3)' }
                      }}
                    >
                      <InstagramIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={hasLink(socialLinks.xiaohongshu) ? "Xiaohongshu / 小红书" : (adminModeEnabled ? "Xiaohongshu (Click to configure)" : "Xiaohongshu (Not configured)")}>
                  <span>
                    <IconButton
                      href={hasLink(socialLinks.xiaohongshu) ? socialLinks.xiaohongshu : '#'}
                      target={hasLink(socialLinks.xiaohongshu) ? "_blank" : undefined}
                      onClick={(e) => handleSocialClick(socialLinks.xiaohongshu, e)}
                      disabled={!hasLink(socialLinks.xiaohongshu) && !adminModeEnabled}
                      sx={{
                        color: hasLink(socialLinks.xiaohongshu) ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
                        padding: { xs: '4px', sm: '6px' },
                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                        '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.3)' }
                      }}
                    >
                      <XiaohongshuIcon sx={{ fontSize: { xs: '1.5rem', sm: '1.8rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={hasLink(socialLinks.heylo) ? "Heylo" : (adminModeEnabled ? "Heylo (Click to configure)" : "Heylo (Not configured)")}>
                  <span>
                    <IconButton
                      href={hasLink(socialLinks.heylo) ? socialLinks.heylo : '#'}
                      target={hasLink(socialLinks.heylo) ? "_blank" : undefined}
                      onClick={(e) => handleSocialClick(socialLinks.heylo, e)}
                      disabled={!hasLink(socialLinks.heylo) && !adminModeEnabled}
                      sx={{
                        color: hasLink(socialLinks.heylo) ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
                        padding: { xs: '4px', sm: '6px' },
                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                        '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.3)' }
                      }}
                    >
                      <HeyloIcon sx={{ fontSize: { xs: '0.86rem', sm: '0.98rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={hasLink(socialLinks.shop) ? "Shop" : (adminModeEnabled ? "Shop (Click to configure)" : "Shop (Not configured)")}>
                  <span>
                    <IconButton
                      href={hasLink(socialLinks.shop) ? socialLinks.shop : '#'}
                      target={hasLink(socialLinks.shop) ? "_blank" : undefined}
                      onClick={(e) => handleSocialClick(socialLinks.shop, e)}
                      disabled={!hasLink(socialLinks.shop) && !adminModeEnabled}
                      sx={{
                        color: hasLink(socialLinks.shop) ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
                        padding: { xs: '4px', sm: '6px' },
                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                        '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.3)' }
                      }}
                    >
                      <ShoppingBagIcon sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 } }}>
              {/* Admin Panel Button with Mode Toggle - only visible to admins */}
              {isAdmin && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: adminModeEnabled ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 215, 0, 0.15)',
                    borderRadius: '8px',
                    border: adminModeEnabled ? '1px solid #FFD700' : '1px solid rgba(255, 215, 0, 0.5)',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden',
                  }}
                >
                  <Tooltip title={isFullAdmin ? "Admin Dashboard / 管理仪表板" : "Committee Dashboard / 委员仪表板"}>
                    <Button
                      component={NavLink}
                      to="/admin"
                      sx={{
                        color: '#FFD700',
                        textTransform: 'none',
                        fontSize: { xs: '0.75rem', sm: '0.9rem' },
                        minWidth: 'auto',
                        px: { xs: 1, sm: 2 },
                        py: { xs: 0.5, sm: 1 },
                        borderRadius: 0,
                        '&:hover': {
                          backgroundColor: 'rgba(255, 215, 0, 0.25)',
                        }
                      }}
                    >
                      <Badge
                        badgeContent={pendingCount}
                        color="error"
                        sx={{
                          '& .MuiBadge-badge': {
                            fontSize: '0.65rem',
                            minWidth: '16px',
                            height: '16px',
                            padding: '0 4px',
                          }
                        }}
                      >
                        <AdminPanelSettingsIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.2rem' } }} />
                      </Badge>
                      {!isMobile && <span style={{ marginLeft: '4px' }}>{isFullAdmin ? 'Admin Dashboard' : 'Committee Dashboard'}</span>}
                    </Button>
                  </Tooltip>
                  <Tooltip title={adminModeEnabled ? "Switch to Runner Mode / 切换跑者模式" : `Switch to ${isFullAdmin ? 'Admin' : 'Committee'} Mode / 切换${isFullAdmin ? '管理员' : '委员'}模式`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', pr: { xs: 0.5, sm: 1 } }}>
                      <Switch
                        checked={adminModeEnabled}
                        onChange={toggleAdminMode}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase': {
                            color: 'white',
                            '&.Mui-checked': {
                              color: '#FFD700',
                            },
                            '&.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: '#FFD700',
                            },
                          },
                          '& .MuiSwitch-track': {
                            backgroundColor: 'rgba(255, 255, 255, 0.5)',
                          },
                        }}
                      />
                    </Box>
                  </Tooltip>
                </Box>
              )}

              <Tooltip title="Profile / 个人资料">
                <Button
                  component={NavLink}
                  to="/profile"
                  sx={{
                    color: 'white',
                    textTransform: 'none',
                    fontSize: { xs: '0.75rem', sm: '0.9rem' },
                    minWidth: 'auto',
                    px: { xs: 1, sm: 3 },
                    py: { xs: 0.5, sm: 1 },
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
                  {isMobile ? <PersonIcon sx={{ fontSize: '1.1rem' }} /> : 'Profile'}
                </Button>
              </Tooltip>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>
    </Box>
  );
}
