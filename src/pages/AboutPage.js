import { Box, Container, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function AboutPage() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* About Us Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 500,
              fontSize: '1.1rem',
              color: '#FFA500',
              whiteSpace: 'pre-line',
            }}
          >
            About Us
            关于我们
          </Typography>
        </Box>
      </Container>

      {/* About Us Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
        <Box
          sx={{
            width: '100%',
            height: '500px',
            overflow: 'hidden',
            position: 'relative',
            borderRadius: '12px',
            cursor: 'pointer',
            backgroundColor: '#4a4a4a',
            display: 'block', // Ensure block display for <a>
            '&:hover': {
              backgroundColor: '#5a5a5a',
            },
          }}
          component="a"
          href="/AboutUs"
        >
          <Box
            component="img"
            src="/AboutUs.png"
            alt="AboutUs"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '12px',
            }}
          />
        </Box>
      </Container>

      {/* History Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 500,
              fontSize: '1.1rem',
              color: '#FFA500',
              whiteSpace: 'pre-line',
            }}
          >
            History
            新蜂历史
          </Typography>
        </Box>
      </Container>

      {/* History Content */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2, mb: 4 }}>
        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: '12px',
          p: { xs: 3, md: 6 },
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        }}>
          <Typography
            variant="body1"
            sx={{
              mb: 3,
              fontSize: '1rem',
              lineHeight: 1.8,
              color: '#333',
              whiteSpace: 'pre-line'
            }}
          >
            新蜂跑团
             - 纽约新蜂跑团成立于2016年，由Junxiao Yi、Patrick等人共同创办。跑团的初衷是为在纽约的华人群体提供一个共同跑步、结交朋友的平台。随着时间的推移，新蜂跑团逐渐发展壮大，吸引了越来越多热爱跑步的朋友加入。
            如今，新蜂跑团已成为NYRR（纽约路跑协会）旗下300多支跑团中的佼佼者，并位居A组（前12名），展现出强大的竞争力。跑团的规模也不断扩展，目前已拥有600多名成员，其中超过150人已在NYRR注册。我们致力于提供专业的训练和支持，鼓励每一位跑者不断挑战自我，超越极限。
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontSize: '1rem',
              lineHeight: 1.8,
              color: '#333',
              whiteSpace: 'pre-line'
            }}
          >
            NewBee Running Club
             - NewBee Running Club was founded in 2016 by Junxiao Yi, Patrick, and others with the mission to create a community for Chinese runners in New York to run together and build friendships. Over time, the club has grown and evolved, attracting more and more running enthusiasts.
            Today, the NewBee Running Club is one of the most competitive clubs in the NYRR (New York Road Runners) league, ranking in the A group (top 12) out of over 300 clubs. The club has also expanded significantly, with over 600 members, and more than 150 registered with NYRR. We are committed to providing professional training and support, encouraging each runner to challenge themselves and reach new limits.
          </Typography>
        </Box>
      </Container>

      {/* History Photos Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Box sx={{ 
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 3
        }}>
          {/* Photo 1 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}>
            <Box
              component="img"
              src="/History - 1.png"
              alt="NewBee History 1"
              sx={{
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Typography
              variant="body1"
              sx={{
                textAlign: 'center',
                color: '#333',
                fontSize: '0.9rem',
                lineHeight: 1.6
              }}
            >
              2016年成立初期
              Early Days of 2016
            </Typography>
          </Box>

          {/* Photo 2 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}>
            <Box
              component="img"
              src="/History - 2.png"
              alt="NewBee History 2"
              sx={{
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Typography
              variant="body1"
              sx={{
                textAlign: 'center',
                color: '#333',
                fontSize: '0.9rem',
                lineHeight: 1.6
              }}
            >
              2018年团队发展
              Team Growth in 2018
            </Typography>
          </Box>

          {/* Photo 3 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}>
            <Box
              component="img"
              src="/History - 3.png"
              alt="NewBee History 3"
              sx={{
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Typography
              variant="body1"
              sx={{
                textAlign: 'center',
                color: '#333',
                fontSize: '0.9rem',
                lineHeight: 1.6
              }}
            >
              2023年成就时刻
              Achievement Moments in 2023
            </Typography>
          </Box>
        </Box>
      </Container>

      {/* History Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 500,
              fontSize: '1.1rem',
              color: '#FFA500',
              whiteSpace: 'pre-line',
            }}
          >
            Board of Committee  
            新蜂委员会
          </Typography>
        </Box>
      </Container>

      {/* Committee Members Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4, mb: 6 }}>
        <Box sx={{ 
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' },
          gap: 3
        }}>
          {/* Member 1 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/junxiao-yi" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 1.png"
                alt="Committee Member 1"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Junxiao Yi
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                President, Founder
                会长，创始人
              </Typography>
            </Link>
          </Box>

          {/* Member 2 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/Lingqiao Tang" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 2.png"
                alt="Committee Member 2"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Lingqiao Tang
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                Board Member
                委员会成员
              </Typography>
            </Link>
          </Box>

          {/* Member 3 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/member3" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 3.png"
                alt="Committee Member 3"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Yue Ma
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                Board Member
                委员会成员
              </Typography>
            </Link>
          </Box>

          {/* Member 4 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/member4" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 4.png"
                alt="Committee Member 4"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Brandon Shen
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                Board Member
                委员会成员
              </Typography>
            </Link>
          </Box>

          {/* Member 5 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/member5" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 5.png"
                alt="Committee Member 5"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Shawn Tian
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                Board Member
                委员会成员
              </Typography>
            </Link>
          </Box>

          {/* Member 6 */}
          <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5
          }}>
            <Link 
              to="/committee/member6" 
              style={{ 
                textDecoration: 'none',
                color: 'inherit',
                width: '100%'
              }}
            >
              <Box
                component="img"
                src="/committee 6.png"
                alt="Committee Member 6"
                sx={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  textAlign: 'center',
                  color: '#333',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  mt: 1.5
                }}
              >
                Ciping Wu
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: '0.9rem'
                }}
              >
                Board Member
                委员会成员
              </Typography>
            </Link>
          </Box>
        </Box>
      </Container>

    </Box>
  );
} 