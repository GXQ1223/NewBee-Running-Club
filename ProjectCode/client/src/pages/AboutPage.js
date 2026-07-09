import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Modal,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { safeMarkdown } from '../utils/markdown';
import { useEffect, useState, useCallback } from 'react';
import NavigationButtons from '../components/NavigationButtons';
import CommitteeMemberCard from '../components/CommitteeMemberCard';
import { committee2026, committee2024 } from '../data/committeeMembers';
import { getMeetingContent, getMeetingFiles } from '../api/meetings';
import {
  getAllMeetingMinutes,
  createMeetingMinutes,
  updateMeetingMinutes,
  deleteMeetingMinutes
} from '../api/meetingMinutes';
import DOMPurify from 'dompurify';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useAutoFillOnTab } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

// Quill editor configuration for meeting minutes
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    ['clean']
  ],
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline',
  'list', 'bullet',
  'indent'
];

export default function AboutPage() {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [electionStandards, setElectionStandards] = useState('');
  const [standardsLoading, setStandardsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  // Meeting minutes state
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingsError, setMeetingsError] = useState('');
  const [meetingsSuccess, setMeetingsSuccess] = useState('');

  // Meeting minutes editor state
  const [isMeetingEditing, setIsMeetingEditing] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [meetingFormData, setMeetingFormData] = useState({
    title: '',
    meeting_date: new Date().toISOString().split('T')[0],
    content: ''
  });
  const [meetingSaving, setMeetingSaving] = useState(false);

  // Delete confirmation dialog for meetings
  const [deleteMeetingDialog, setDeleteMeetingDialog] = useState({ open: false, id: null, title: '' });
  const [deletingMeeting, setDeletingMeeting] = useState(false);

  // Default values for Tab auto-fill
  const meetingDefaultValues = {
    title: 'Committee Meeting - [Month Year]'
  };

  const handleMeetingAutoFill = useAutoFillOnTab({
    setValue: (field, value) => setMeetingFormData(prev => ({ ...prev, [field]: value })),
    defaultValues: meetingDefaultValues
  });

  // Sanitize HTML content for display
  const sanitizeMeetingHtml = (html) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'br'],
      ALLOWED_ATTR: []
    });
  };

  // Format date for display
  const formatMeetingDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Fetch meeting minutes from database API
  const fetchMeetingMinutes = useCallback(async () => {
    try {
      setMeetingsLoading(true);
      const dbMeetings = await getAllMeetingMinutes();

      // Also fetch local markdown files as fallback
      const mdFiles = getMeetingFiles();
      const localMeetings = await Promise.all(
        mdFiles.map(async (filename) => {
          try {
            const content = await getMeetingContent(filename);
            const title = (content || '').split('\n')[0].replace('# ', '');
            const date = filename.split('.')[0];
            return {
              title,
              content,
              meeting_date: date,
              filename,
              isLocal: true
            };
          } catch (error) {
            return null;
          }
        })
      );

      // Combine database meetings with local ones
      const validLocalMeetings = localMeetings.filter(m => m !== null);

      // Database meetings take priority - format them consistently
      const formattedDbMeetings = dbMeetings.map(m => ({
        ...m,
        isLocal: false
      }));

      // Combine and sort by date (most recent first)
      const allMeetings = [...formattedDbMeetings, ...validLocalMeetings];
      allMeetings.sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date));

      setMeetings(allMeetings);
      setMeetingsError('');
    } catch (err) {
      console.error('Error fetching meeting minutes:', err);
      // Fall back to local files only
      try {
        const mdFiles = getMeetingFiles();
        const localMeetings = await Promise.all(
          mdFiles.map(async (filename) => {
            try {
              const content = await getMeetingContent(filename);
              const title = (content || '').split('\n')[0].replace('# ', '');
              const date = filename.split('.')[0];
              return { title, content, meeting_date: date, filename, isLocal: true };
            } catch (error) {
              return null;
            }
          })
        );
        const validMeetings = localMeetings.filter(m => m !== null);
        validMeetings.sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date));
        setMeetings(validMeetings);
      } catch (localErr) {
        console.error('Error fetching local meetings:', localErr);
      }
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  // Meeting minutes editor handlers
  const handleStartNewMeeting = () => {
    setIsMeetingEditing(true);
    setEditingMeetingId(null);
    setMeetingFormData({
      title: '',
      meeting_date: new Date().toISOString().split('T')[0],
      content: ''
    });
  };

  const handleStartEditMeeting = (meeting) => {
    if (meeting.isLocal) {
      setMeetingsError('Local files cannot be edited. Only database entries can be modified.');
      setTimeout(() => setMeetingsError(''), 5000);
      return;
    }
    setIsMeetingEditing(true);
    setEditingMeetingId(meeting.id);
    setMeetingFormData({
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      content: meeting.content
    });
  };

  const handleCancelMeeting = () => {
    setIsMeetingEditing(false);
    setEditingMeetingId(null);
    setMeetingFormData({
      title: '',
      meeting_date: new Date().toISOString().split('T')[0],
      content: ''
    });
  };

  const handleSaveMeeting = async () => {
    if (!meetingFormData.title.trim()) {
      setMeetingsError('Please enter a title. / 请输入标题。');
      return;
    }
    if (!meetingFormData.meeting_date) {
      setMeetingsError('Please select a meeting date. / 请选择会议日期。');
      return;
    }
    if (!meetingFormData.content.trim() || meetingFormData.content === '<p><br></p>') {
      setMeetingsError('Please enter meeting minutes content. / 请输入会议纪要内容。');
      return;
    }

    setMeetingSaving(true);
    setMeetingsError('');
    try {
      if (editingMeetingId) {
        await updateMeetingMinutes(editingMeetingId, meetingFormData, currentUser.uid);
        setMeetingsSuccess('Meeting minutes updated successfully! / 会议纪要更新成功！');
      } else {
        await createMeetingMinutes(meetingFormData, currentUser.uid);
        setMeetingsSuccess('Meeting minutes created successfully! / 会议纪要创建成功！');
      }

      await fetchMeetingMinutes();
      handleCancelMeeting();
      setTimeout(() => setMeetingsSuccess(''), 5000);
    } catch (err) {
      console.error('Error saving meeting minutes:', err);
      setMeetingsError('Failed to save meeting minutes. Please try again. / 保存失败，请重试。');
    } finally {
      setMeetingSaving(false);
    }
  };

  const handleDeleteMeetingClick = (meeting) => {
    if (meeting.isLocal) {
      setMeetingsError('Local files cannot be deleted through the app.');
      setTimeout(() => setMeetingsError(''), 5000);
      return;
    }
    setDeleteMeetingDialog({ open: true, id: meeting.id, title: meeting.title });
  };

  const handleDeleteMeetingConfirm = async () => {
    setDeletingMeeting(true);
    try {
      await deleteMeetingMinutes(deleteMeetingDialog.id, currentUser.uid);
      setMeetingsSuccess('Meeting minutes deleted successfully! / 会议纪要已删除！');
      await fetchMeetingMinutes();
      setTimeout(() => setMeetingsSuccess(''), 5000);
    } catch (err) {
      console.error('Error deleting meeting minutes:', err);
      setMeetingsError('Failed to delete meeting minutes. / 删除失败。');
    } finally {
      setDeletingMeeting(false);
      setDeleteMeetingDialog({ open: false, id: null, title: '' });
    }
  };

  const handleDeleteMeetingCancel = () => {
    setDeleteMeetingDialog({ open: false, id: null, title: '' });
  };

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

  // Fetch meeting minutes
  useEffect(() => {
    fetchMeetingMinutes();
  }, [fetchMeetingMinutes]);

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
              loading="lazy"
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
              loading="lazy"
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
              loading="lazy"
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

      {/* Committee Members Section - 2026-2028 (Current) */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2, mb: 6 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: '#333',
            mb: 3,
            fontSize: { xs: '1.1rem', sm: '1.4rem' },
            textAlign: 'center'
          }}
        >
          2026 - 2028 Committee 现任委员会
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 3
        }}>
          {committee2026.map((member) => (
            <CommitteeMemberCard
              key={member.id}
              member={member}
              onImageClick={handleImageClick}
            />
          ))}
        </Box>
      </Container>

      {/* Committee Members Section - 2024-2026 (Past) */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 2, mb: 6 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: '#333',
            mb: 3,
            fontSize: { xs: '1.1rem', sm: '1.4rem' },
            textAlign: 'center'
          }}
        >
          2024 - 2026 Committee 往届委员会
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 3
        }}>
          {committee2024.map((member) => (
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

      {/* Meeting Minutes Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: { xs: 3, sm: 4 } }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 2,
            fontSize: { xs: '1rem', sm: '1.25rem' }
          }}
        >
          Meeting Minutes 会议纪要
        </Typography>

        {adminModeEnabled && !isMeetingEditing && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: { xs: 2, sm: 3 } }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleStartNewMeeting}
              sx={{
                backgroundColor: '#FFB84D',
                color: 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#FFA833',
                }
              }}
            >
              Add Meeting Minutes
            </Button>
          </Box>
        )}

        {!adminModeEnabled && <Box sx={{ mb: { xs: 2, sm: 3 } }} />}

        {/* Success/Error Messages */}
        {meetingsSuccess && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMeetingsSuccess('')}>
            {meetingsSuccess}
          </Alert>
        )}
        {meetingsError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMeetingsError('')}>
            {meetingsError}
          </Alert>
        )}

        {/* Editor Form */}
        {isMeetingEditing && (
          <Box sx={{
            mb: 3,
            p: { xs: 2, sm: 3 },
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            border: '2px solid #FFA500'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#333' }}>
              {editingMeetingId ? 'Edit Meeting Minutes / 编辑会议纪要' : 'New Meeting Minutes / 新会议纪要'}
            </Typography>

            <TextField
              name="title"
              fullWidth
              label="Title / 标题"
              value={meetingFormData.title}
              onChange={(e) => setMeetingFormData({ ...meetingFormData, title: e.target.value })}
              onKeyDown={handleMeetingAutoFill}
              sx={{ mb: 2 }}
              placeholder={meetingDefaultValues.title}
            />

            <TextField
              fullWidth
              type="date"
              label="Meeting Date / 会议日期"
              value={meetingFormData.meeting_date}
              onChange={(e) => setMeetingFormData({ ...meetingFormData, meeting_date: e.target.value })}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
            />

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Content / 内容 (supports bold, lists, and formatting)
            </Typography>
            <Box sx={{ mb: 2, '.ql-container': { minHeight: '200px' }, backgroundColor: 'white' }}>
              <ReactQuill
                theme="snow"
                value={meetingFormData.content}
                onChange={(content) => setMeetingFormData({ ...meetingFormData, content })}
                modules={quillModules}
                formats={quillFormats}
                placeholder="Enter meeting minutes here... / 在此输入会议纪要..."
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                startIcon={<CancelIcon />}
                onClick={handleCancelMeeting}
                disabled={meetingSaving}
              >
                Cancel / 取消
              </Button>
              <Button
                variant="contained"
                startIcon={meetingSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={handleSaveMeeting}
                disabled={meetingSaving}
                sx={{
                  backgroundColor: '#FFA500',
                  '&:hover': { backgroundColor: '#FF8C00' }
                }}
              >
                {meetingSaving ? 'Saving...' : 'Save / 保存'}
              </Button>
            </Box>
          </Box>
        )}

        {meetingsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: '#FFA500' }} />
          </Box>
        ) : meetings.length === 0 ? (
          <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
            No meeting minutes available.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {meetings.map((meeting) => (
              <Accordion
                key={meeting.id || meeting.filename}
                defaultExpanded={false}
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
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      pr: 1
                    },
                    '& .MuiAccordionSummary-expandIconWrapper': {
                      color: '#FFA500',
                    }
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        color: '#333',
                        fontSize: { xs: '1rem', sm: '1.25rem' }
                      }}
                    >
                      {meeting.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatMeetingDate(meeting.meeting_date)}
                      {meeting.isLocal && ' (Local file)'}
                    </Typography>
                  </Box>

                  {adminModeEnabled && !meeting.isLocal && (
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 2 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Edit / 编辑">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditMeeting(meeting);
                          }}
                          disabled={isMeetingEditing}
                          sx={{ color: 'primary.main' }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete / 删除">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMeetingClick(meeting);
                          }}
                          disabled={isMeetingEditing}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    dangerouslySetInnerHTML={{
                      __html: meeting.isLocal ? safeMarkdown(meeting.content) : sanitizeMeetingHtml(meeting.content)
                    }}
                    sx={{
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
                      '& p': {
                        marginBottom: '0.5rem'
                      },
                      '& ul, & ol': {
                        paddingLeft: '1.5rem',
                        marginBottom: '1rem'
                      },
                      '& li': {
                        marginBottom: '0.5rem'
                      }
                    }}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Container>

      {/* Delete Meeting Confirmation Dialog */}
      <Dialog open={deleteMeetingDialog.open} onClose={handleDeleteMeetingCancel}>
        <DialogTitle>
          Delete Meeting Minutes?
          <br />
          删除会议纪要？
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{deleteMeetingDialog.title}"? This action cannot be undone.
            <br /><br />
            您确定要删除"{deleteMeetingDialog.title}"吗？此操作无法撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteMeetingCancel} disabled={deletingMeeting}>
            Cancel / 取消
          </Button>
          <Button
            onClick={handleDeleteMeetingConfirm}
            variant="contained"
            color="error"
            disabled={deletingMeeting}
          >
            {deletingMeeting ? <CircularProgress size={20} /> : 'Delete / 删除'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
