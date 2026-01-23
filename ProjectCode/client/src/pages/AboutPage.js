import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Container,
  Modal,
  Typography
} from '@mui/material';
import { safeMarkdown } from '../utils/markdown';
import { useEffect, useState } from 'react';
import NavigationButtons from '../components/NavigationButtons';
import CommitteeMemberCard from '../components/CommitteeMemberCard';
import { committeeMembers } from '../data/committeeMembers';

export default function AboutPage() {
  const [electionStandards, setElectionStandards] = useState('');
  const [standardsLoading, setStandardsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  const handleImageClick = (imageSrc) => {
    setSelectedImage(imageSrc);
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
  };

  useEffect(() => {
    const fetchElectionStandards = async () => {
      try {
        const response = await fetch('/data/committee/election_standards.md');
        const text = await response.text();
        setElectionStandards(text);
        setStandardsLoading(false);
      } catch (error) {
        console.error('Error fetching election standards:', error);
        setStandardsLoading(false);
      }
    };

    fetchElectionStandards();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Navigation Buttons */}
      <NavigationButtons />

      {/* History Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          NewBee's History
          <br />
          新蜂历史
        </Typography>
      </Container>

      {/* History Content */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 0, mb: 4 }}>
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
      <Container maxWidth="xl" sx={{ px: 2, mt: 4, mb: 6 }}>
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

      {/* Board of Committee Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: { xs: 2, sm: 3 },
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          Board of Committee
          <br />
          新蜂委员会
        </Typography>
      </Container>

      {/* Committee Members Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4, mb: 6 }}>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 3
        }}>
          {committeeMembers.map((member) => (
            <CommitteeMemberCard
              key={member.id}
              member={member}
              onImageClick={handleImageClick}
            />
          ))}
        </Box>
      </Container>

      {/* Image Modal */}
      <Modal
        open={!!selectedImage}
        onClose={handleCloseModal}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <Box
          onClick={handleCloseModal}
          sx={{
            position: 'relative',
            width: 'auto',
            maxWidth: '90vw',
            maxHeight: '90vh',
            cursor: 'pointer'
          }}
        >
          {selectedImage && (
            <Box
              component="img"
              src={selectedImage}
              alt="Enlarged Committee Member"
              sx={{
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          )}
        </Box>
      </Modal>

      {/* Committee Election Standards Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 0, mb: 4 }}>
        <Accordion
          sx={{
            backgroundColor: 'white',
            borderRadius: '12px !important',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            '&:before': {
              display: 'none',
            },
            '&.Mui-expanded': {
              margin: '0',
            }
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              '& .MuiAccordionSummary-content': {
                margin: '12px 0',
              },
              '& .MuiAccordionSummary-expandIconWrapper': {
                color: '#FFA500',
              }
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: '#333',
              }}
            >
              Committee Election Standards
              委员会选举/换届标准
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {standardsLoading ? (
              <Typography variant="body1" color="text.secondary">
                Loading...
              </Typography>
            ) : (
              <div
                dangerouslySetInnerHTML={{
                  __html: safeMarkdown(electionStandards)
                }}
                style={{
                  '& h1': {
                    fontSize: '1.8rem',
                    fontWeight: 600,
                    color: '#333',
                    marginBottom: '1rem'
                  },
                  '& h2': {
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: '#444',
                    marginBottom: '0.8rem'
                  },
                  '& h3': {
                    fontSize: '1.2rem',
                    fontWeight: 600,
                    color: '#555',
                    marginBottom: '0.6rem'
                  },
                  '& ul': {
                    paddingLeft: '1.5rem',
                    marginBottom: '1rem'
                  },
                  '& li': {
                    marginBottom: '0.5rem'
                  }
                }}
              />
            )}
          </AccordionDetails>
        </Accordion>
      </Container>

    </Box>
  );
}
