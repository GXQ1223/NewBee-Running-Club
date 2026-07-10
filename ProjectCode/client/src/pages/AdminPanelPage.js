import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MeetingMinutesEditor from '../components/MeetingMinutesEditor';
import { useAuth } from '../context/AuthContext';
import { getPendingMembers, approveMember, rejectMember, getMemberByFirebaseUid, getAllMembers, updateMember, promoteToCommittee, demoteFromCommittee } from '../api/members';
import { createEvent, getAllEvents, updateEvent, deleteEvent } from '../api/events';
import { getDonationSummary } from '../api/donors';
import { getAllBanners, createBanner, updateBanner, deleteBanner } from '../api/banners';
import { getAllSections, createSection, updateSection, deleteSection } from '../api/homepageSections';
import { getPendingActivities, verifyActivity, getMemberActivities } from '../api/activities';
import { getSettingsByCategory, updateSetting } from '../api/settings';
import { useSocialLinks } from '../context';
import { committeeMembers } from '../data/committeeMembers';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import PeopleIcon from '@mui/icons-material/People';
import EventIcon from '@mui/icons-material/Event';
import EmailIcon from '@mui/icons-material/Email';
import BarChartIcon from '@mui/icons-material/BarChart';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import GroupsIcon from '@mui/icons-material/Groups';

const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const MUTED = '#757575';

// Shared panel styling to match the redesigned homepage
const panelSx = {
  backgroundColor: 'white',
  border: `1px solid ${LINE}`,
  borderRadius: '12px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
};

// Primary action button: filled orange pill
const orangeButtonSx = {
  backgroundColor: ORANGE,
  borderRadius: '99px',
  textTransform: 'none',
  fontWeight: 600,
  '&:hover': { backgroundColor: ORANGE_DARK },
};

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AdminPanelPage() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [tabValue, setTabValue] = useState(0);

  // Check for tab query parameter on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'settings') {
      setTabValue(8); // Settings tab index
    }
  }, [searchParams]);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [donationStats, setDonationStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, id: null, name: '' });
  const [successMessage, setSuccessMessage] = useState('');

  // Rejection dialog state
  const [rejectDialog, setRejectDialog] = useState({ open: false, id: null, name: '' });
  const [rejectionReason, setRejectionReason] = useState('');
  const [isCommittee, setIsCommittee] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // True only for full admin status
  const [currentMemberData, setCurrentMemberData] = useState(null);

  // All Members table state
  const [memberSortColumn, setMemberSortColumn] = useState('created_at');
  const [memberSortDirection, setMemberSortDirection] = useState('desc');
  const [memberPage, setMemberPage] = useState(0);
  const [memberRowsPerPage, setMemberRowsPerPage] = useState(10);
  const [memberSearch, setMemberSearch] = useState('');

  // Edit member dialog state
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editMemberFormData, setEditMemberFormData] = useState({});

  // Activity verification state
  const [pendingActivities, setPendingActivities] = useState([]);
  const [activityDetailsOpen, setActivityDetailsOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedActivityMember, setSelectedActivityMember] = useState(null);
  const [selectedMemberActivities, setSelectedMemberActivities] = useState([]);

  // Event form state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventFormData, setEventFormData] = useState({
    name: '',
    chinese_name: '',
    date: '',
    time: '',
    location: '',
    chinese_location: '',
    description: '',
    chinese_description: '',
    image: '',
    signup_link: '',
    status: 'Upcoming',
    is_highlight: false
  });

  // Newsletter state
  const [newsletterSubject, setNewsletterSubject] = useState('');
  const [newsletterContent, setNewsletterContent] = useState('');
  const [sendingNewsletter, setSendingNewsletter] = useState(false);

  // Banner state
  const [banners, setBanners] = useState([]);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [bannerFormData, setBannerFormData] = useState({
    image_url: '',
    alt_text: '',
    link_path: '',
    label_en: '',
    label_cn: '',
    display_order: 0,
    is_active: true
  });

  // Section state
  const [sections, setSections] = useState([]);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [sectionFormData, setSectionFormData] = useState({
    title_en: '',
    title_cn: '',
    image_url: '',
    link_path: '',
    display_order: 0,
    is_active: true
  });

  // Site Settings state
  const { refreshLinks } = useSocialLinks();
  const [socialLinksForm, setSocialLinksForm] = useState({
    instagram: '',
    xiaohongshu: '',
    heylo: '',
    shop: '',
    shopDemoVideo: ''
  });
  const [joinRequirementsForm, setJoinRequirementsForm] = useState({
    minEnglishWords: '120',
    minChineseChars: '240'
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Check if current user is committee member or admin
  useEffect(() => {
    const checkCommitteeStatus = async () => {
      if (!currentUser) {
        setIsCommittee(false);
        setIsAdmin(false);
        return;
      }

      try {
        const memberData = await getMemberByFirebaseUid(currentUser.uid);
        setCurrentMemberData(memberData);
        // Full admin status (can manage committee)
        const hasAdminStatus = memberData.status === 'admin';
        // Committee or admin status (can access admin panel)
        const hasCommitteeStatus = memberData.status === 'committee';
        const isInCommitteeList = committeeMembers.some(
          cm => cm.name === memberData.display_name || cm.name === memberData.username
        );
        const hasCommitteeAccess = hasAdminStatus || hasCommitteeStatus || isInCommitteeList;
        setIsAdmin(hasAdminStatus);
        setIsCommittee(hasCommitteeAccess);
        if (!hasCommitteeAccess) {
          // The data-fetch effect only runs for committee members, so stop the
          // loading spinner here or the Access Denied state can never render.
          setLoading(false);
        }
      } catch (err) {
        console.error('Error checking committee status:', err);
        setIsCommittee(false);
        setIsAdmin(false);
        setLoading(false);
      }
    };

    checkCommitteeStatus();
  }, [currentUser]);

  // Fetch all admin data
  useEffect(() => {
    const fetchAdminData = async () => {
      if (!isCommittee || !currentUser) {
        setLoading(false);
        return;
      }

      try {
        const [pending, members, eventList, donations, bannerList, sectionList, activities] = await Promise.all([
          getPendingMembers(currentUser.uid).catch(() => []),
          getAllMembers(currentUser.uid).catch(() => []),
          getAllEvents().catch(() => []),
          getDonationSummary().catch(() => []),
          getAllBanners(currentUser.uid).catch(() => []),
          getAllSections(currentUser.uid).catch(() => []),
          getPendingActivities(currentUser.uid).catch(() => [])
        ]);

        setPendingMembers(pending);
        setAllMembers(members);
        setEvents(eventList);
        setDonationStats(donations);
        setBanners(bannerList);
        setSections(sectionList);
        setPendingActivities(activities);
        setError('');
      } catch (err) {
        console.error('Error fetching admin data:', err);
        setError('Failed to load admin data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (isCommittee) {
      fetchAdminData();
    }
  }, [isCommittee, currentUser]);

  const handleApprove = (memberId, memberName) => {
    setConfirmDialog({ open: true, action: 'approve', id: memberId, name: memberName });
  };

  const handleReject = (memberId, memberName) => {
    setRejectDialog({ open: true, id: memberId, name: memberName });
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection.');
      return;
    }

    const { id, name } = rejectDialog;
    setActionLoading(id);
    setRejectDialog({ open: false, id: null, name: '' });

    try {
      await rejectMember(id, currentUser.uid, rejectionReason.trim());
      setSuccessMessage(`Successfully rejected ${name}'s application. An email has been sent to notify them.`);
      setPendingMembers(prev => prev.filter(m => m.id !== id));
      setRejectionReason('');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error rejecting member:', err);
      setError('Failed to reject member. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelReject = () => {
    setRejectDialog({ open: false, id: null, name: '' });
    setRejectionReason('');
  };

  const handleConfirmAction = async () => {
    const { action, id, name } = confirmDialog;
    setActionLoading(id);
    setConfirmDialog({ ...confirmDialog, open: false });

    try {
      if (action === 'approve') {
        await approveMember(id, currentUser.uid);
        setSuccessMessage(`Successfully approved ${name}!`);
        setPendingMembers(prev => prev.filter(m => m.id !== id));
      } else if (action === 'deleteEvent') {
        await deleteEvent(id, currentUser.uid);
        setSuccessMessage('Event deleted successfully!');
        setEvents(prev => prev.filter(e => e.id !== id));
      } else if (action === 'deleteBanner') {
        await deleteBanner(id, currentUser.uid);
        setSuccessMessage('Banner deleted successfully!');
        setBanners(prev => prev.filter(b => b.id !== id));
      } else if (action === 'deleteSection') {
        await deleteSection(id, currentUser.uid);
        setSuccessMessage('Section deleted successfully!');
        setSections(prev => prev.filter(s => s.id !== id));
      }
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error(`Error performing action:`, err);
      setError(`Failed to complete action. Please try again.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelAction = () => {
    setConfirmDialog({ open: false, action: null, id: null, name: '' });
  };

  // Edit member handlers
  const handleEditMember = (member) => {
    setEditingMember(member);
    setEditMemberFormData({
      display_name: member.display_name || '',
      display_name_cn: member.display_name_cn || '',
      email: member.email || '',
      gender: member.gender || '',
      birth_year: member.birth_year || '',
      phone: member.phone || '',
      nyrr_member_id: member.nyrr_member_id || '',
      status: member.status || ''
    });
    setEditMemberDialogOpen(true);
  };

  const handleSaveMember = async () => {
    if (!editingMember) return;
    setActionLoading(editingMember.id);
    try {
      const updateData = {};
      // Only include fields that have values, convert types properly
      for (const [key, value] of Object.entries(editMemberFormData)) {
        if (value === '' || value === null || value === undefined) continue;
        if (key === 'birth_year') {
          updateData[key] = parseInt(value, 10);
        } else {
          updateData[key] = value;
        }
      }
      await updateMember(editingMember.id, updateData, currentUser.uid);
      setSuccessMessage(`Updated ${editMemberFormData.display_name || editingMember.username} successfully!`);
      setEditMemberDialogOpen(false);
      // Refresh members
      const members = await getAllMembers(currentUser.uid).catch(() => []);
      setAllMembers(members);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error updating member:', err);
      setError('Failed to update member. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Event form handlers
  const handleEventDialogOpen = (event = null) => {
    if (event) {
      setEditingEvent(event);
      // Legacy 'Highlight' status maps to Past + is_highlight in the new model
      const rawStatus = event.status || 'Upcoming';
      const normalizedStatus = rawStatus === 'Highlight' ? 'Past' : rawStatus;
      const isHighlight = event.is_highlight === true || rawStatus === 'Highlight';
      setEventFormData({
        name: event.name || '',
        chinese_name: event.chinese_name || '',
        date: event.date || '',
        time: event.time || '',
        location: event.location || '',
        chinese_location: event.chinese_location || '',
        description: event.description || '',
        chinese_description: event.chinese_description || '',
        image: event.image || '',
        signup_link: event.signup_link || '',
        status: normalizedStatus,
        is_highlight: isHighlight
      });
    } else {
      setEditingEvent(null);
      setEventFormData({
        name: '',
        chinese_name: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        location: '',
        chinese_location: '',
        description: '',
        chinese_description: '',
        image: '',
        signup_link: '',
        status: 'Upcoming',
        is_highlight: false
      });
    }
    setEventDialogOpen(true);
  };

  const handleEventDialogClose = () => {
    setEventDialogOpen(false);
    setEditingEvent(null);
  };

  const handleEventFormChange = (e) => {
    const { name, value } = e.target;
    setEventFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveEvent = async () => {
    setActionLoading('event');
    try {
      if (editingEvent) {
        const updated = await updateEvent(editingEvent.id, eventFormData, currentUser.uid);
        setEvents(prev => prev.map(e => e.id === editingEvent.id ? updated : e));
        setSuccessMessage('Event updated successfully!');
      } else {
        const created = await createEvent(eventFormData, currentUser.uid);
        setEvents(prev => [created, ...prev]);
        setSuccessMessage('Event created successfully!');
      }
      handleEventDialogClose();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error saving event:', err);
      setError('Failed to save event. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteEvent = (eventId, eventName) => {
    setConfirmDialog({ open: true, action: 'deleteEvent', id: eventId, name: eventName });
  };

  // Banner form handlers
  const handleBannerDialogOpen = (banner = null) => {
    if (banner) {
      setEditingBanner(banner);
      setBannerFormData({
        image_url: banner.image_url || '',
        alt_text: banner.alt_text || '',
        link_path: banner.link_path || '',
        label_en: banner.label_en || '',
        label_cn: banner.label_cn || '',
        display_order: banner.display_order || 0,
        is_active: banner.is_active !== false
      });
    } else {
      setEditingBanner(null);
      setBannerFormData({
        image_url: '',
        alt_text: '',
        link_path: '',
        label_en: '',
        label_cn: '',
        display_order: banners.length,
        is_active: true
      });
    }
    setBannerDialogOpen(true);
  };

  const handleBannerDialogClose = () => {
    setBannerDialogOpen(false);
    setEditingBanner(null);
  };

  const handleBannerFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBannerFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveBanner = async () => {
    setActionLoading('banner');
    try {
      if (editingBanner) {
        const updated = await updateBanner(editingBanner.id, bannerFormData, currentUser.uid);
        setBanners(prev => prev.map(b => b.id === editingBanner.id ? updated : b));
        setSuccessMessage('Banner updated successfully!');
      } else {
        const created = await createBanner(bannerFormData, currentUser.uid);
        setBanners(prev => [...prev, created]);
        setSuccessMessage('Banner created successfully!');
      }
      handleBannerDialogClose();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error saving banner:', err);
      setError('Failed to save banner. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteBanner = (bannerId, bannerLabel) => {
    setConfirmDialog({ open: true, action: 'deleteBanner', id: bannerId, name: bannerLabel || `Banner #${bannerId}` });
  };

  // Section form handlers
  const handleSectionDialogOpen = (section = null) => {
    if (section) {
      setEditingSection(section);
      setSectionFormData({
        title_en: section.title_en || '',
        title_cn: section.title_cn || '',
        image_url: section.image_url || '',
        link_path: section.link_path || '',
        display_order: section.display_order || 0,
        is_active: section.is_active !== false
      });
    } else {
      setEditingSection(null);
      setSectionFormData({
        title_en: '',
        title_cn: '',
        image_url: '',
        link_path: '',
        display_order: sections.length,
        is_active: true
      });
    }
    setSectionDialogOpen(true);
  };

  const handleSectionDialogClose = () => {
    setSectionDialogOpen(false);
    setEditingSection(null);
  };

  const handleSectionFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSectionFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveSection = async () => {
    setActionLoading('section');
    try {
      if (editingSection) {
        const updated = await updateSection(editingSection.id, sectionFormData, currentUser.uid);
        setSections(prev => prev.map(s => s.id === editingSection.id ? updated : s));
        setSuccessMessage('Section updated successfully!');
      } else {
        const created = await createSection(sectionFormData, currentUser.uid);
        setSections(prev => [...prev, created]);
        setSuccessMessage('Section created successfully!');
      }
      handleSectionDialogClose();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error saving section:', err);
      setError('Failed to save section. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSection = (sectionId, sectionTitle) => {
    setConfirmDialog({ open: true, action: 'deleteSection', id: sectionId, name: sectionTitle || `Section #${sectionId}` });
  };

  // Newsletter handler (placeholder - actual email sending would require backend integration)
  const handleSendNewsletter = async () => {
    if (!newsletterSubject || !newsletterContent) {
      setError('Please fill in both subject and content for the newsletter.');
      return;
    }
    setSendingNewsletter(true);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/api/newsletter/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-UID': currentUser.uid,
        },
        body: JSON.stringify({ subject: newsletterSubject, content: newsletterContent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to send newsletter');
      setSuccessMessage(`Newsletter sent! ${result.sent} delivered, ${result.failed} failed out of ${result.total} members.`);
      setNewsletterSubject('');
      setNewsletterContent('');
      setTimeout(() => setSuccessMessage(''), 10000);
    } catch (err) {
      setError(`Failed to send newsletter: ${err.message}`);
    } finally {
      setSendingNewsletter(false);
    }
  };

  // Activity verification handlers
  const handleViewActivityDetails = async (activity) => {
    setSelectedActivity(activity);
    try {
      // Find the member for this activity
      const member = allMembers.find(m => m.id === activity.member_id);
      setSelectedActivityMember(member);
      // Get all activities for this member
      const memberActivities = await getMemberActivities(activity.member_id);
      setSelectedMemberActivities(memberActivities);
    } catch (err) {
      console.error('Error fetching activity details:', err);
    }
    setActivityDetailsOpen(true);
  };

  const handleVerifyActivity = async (activityId, approved, rejectionReason = null) => {
    setActionLoading(`activity-${activityId}`);
    try {
      await verifyActivity(activityId, approved, rejectionReason, currentUser.uid);
      setSuccessMessage(`Activity ${approved ? 'verified' : 'rejected'} successfully!`);
      // Remove from pending list
      setPendingActivities(prev => prev.filter(a => a.id !== activityId));
      setActivityDetailsOpen(false);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error verifying activity:', err);
      setError('Failed to verify activity. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Committee management handlers (admin only)
  const handlePromoteToCommittee = async (memberId, memberName) => {
    setActionLoading(`promote-${memberId}`);
    try {
      await promoteToCommittee(memberId, currentUser.uid);
      setSuccessMessage(`${memberName} promoted to committee successfully!`);
      // Update member status in the list
      setAllMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, status: 'committee' } : m
      ));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error promoting member:', err);
      setError('Failed to promote member. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDemoteFromCommittee = async (memberId, memberName) => {
    setActionLoading(`demote-${memberId}`);
    try {
      await demoteFromCommittee(memberId, currentUser.uid);
      setSuccessMessage(`${memberName} demoted to runner successfully!`);
      // Update member status in the list
      setAllMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, status: 'runner' } : m
      ));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error demoting member:', err);
      setError('Failed to demote member. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Site Settings handlers
  const loadSocialLinksSettings = async () => {
    if (!currentUser?.uid) return;
    try {
      const settings = await getSettingsByCategory('social', currentUser.uid);
      const formData = { instagram: '', xiaohongshu: '', heylo: '', shop: '', shopDemoVideo: '' };
      settings.forEach(setting => {
        if (setting.key === 'social_instagram') formData.instagram = setting.value || '';
        if (setting.key === 'social_xiaohongshu') formData.xiaohongshu = setting.value || '';
        if (setting.key === 'social_heylo') formData.heylo = setting.value || '';
        if (setting.key === 'social_shop') formData.shop = setting.value || '';
        if (setting.key === 'social_shop_demo_video') formData.shopDemoVideo = setting.value || '';
      });
      setSocialLinksForm(formData);
    } catch (err) {
      console.error('Error loading social links settings:', err);
    }
  };

  const loadJoinRequirements = async () => {
    if (!currentUser?.uid) return;
    try {
      const settings = await getSettingsByCategory('join', currentUser.uid);
      const formData = { minEnglishWords: '120', minChineseChars: '240' };
      settings.forEach(setting => {
        if (setting.key === 'join_min_english_words') formData.minEnglishWords = setting.value || '120';
        if (setting.key === 'join_min_chinese_chars') formData.minChineseChars = setting.value || '240';
      });
      setJoinRequirementsForm(formData);
    } catch (err) {
      console.error('Error loading join requirements:', err);
    }
  };

  const handleSaveSettings = async () => {
    if (!currentUser?.uid) return;
    setSettingsLoading(true);
    setSettingsSaved(false);
    try {
      await Promise.all([
        updateSetting('social_instagram', { value: socialLinksForm.instagram }, currentUser.uid),
        updateSetting('social_xiaohongshu', { value: socialLinksForm.xiaohongshu }, currentUser.uid),
        updateSetting('social_heylo', { value: socialLinksForm.heylo }, currentUser.uid),
        updateSetting('social_shop', { value: socialLinksForm.shop }, currentUser.uid),
        updateSetting('social_shop_demo_video', { value: socialLinksForm.shopDemoVideo }, currentUser.uid),
        updateSetting('join_min_english_words', { value: joinRequirementsForm.minEnglishWords }, currentUser.uid),
        updateSetting('join_min_chinese_chars', { value: joinRequirementsForm.minChineseChars }, currentUser.uid),
      ]);
      setSettingsSaved(true);
      refreshLinks(); // Refresh the global social links context
      setTimeout(() => setSettingsSaved(false), 5000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Load settings when Settings tab (index 8) is selected
  useEffect(() => {
    if (tabValue === 8 && currentUser?.uid && isCommittee) {
      loadSocialLinksSettings();
      loadJoinRequirements();
    }
  }, [tabValue, currentUser?.uid, isCommittee]);

  // Analytics calculations
  const getMemberStats = () => {
    const total = allMembers.length;
    const active = allMembers.filter(m => m.status === 'runner' || m.status === 'admin' || m.status === 'committee').length;
    const pending = pendingMembers.length;
    const admins = allMembers.filter(m => m.status === 'admin').length;
    const committee = allMembers.filter(m => m.status === 'committee').length;
    return { total, active, pending, admins, committee };
  };

  const getEventStats = () => {
    const total = events.length;
    const upcoming = events.filter(e => e.status === 'Upcoming').length;
    const highlights = events.filter(e => e.is_highlight === true).length;
    return { total, upcoming, highlights };
  };

  const getDonationTotals = () => {
    const individual = donationStats.find(d => d.donor_type === 'individual') || { total_amount: 0, donor_count: 0 };
    const enterprise = donationStats.find(d => d.donor_type === 'enterprise') || { total_amount: 0, donor_count: 0 };
    return {
      total: parseFloat(individual.total_amount || 0) + parseFloat(enterprise.total_amount || 0),
      individualTotal: parseFloat(individual.total_amount || 0),
      enterpriseTotal: parseFloat(enterprise.total_amount || 0),
      donorCount: (individual.donor_count || 0) + (enterprise.donor_count || 0)
    };
  };

  if (!currentUser) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
          <Alert severity="warning">
            Please log in to access the admin panel.
            <br />
            请登录以访问管理面板。
          </Alert>
        </Container>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Container maxWidth="xl" sx={{ px: 2, mt: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Container>
      </Box>
    );
  }

  if (!isCommittee) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
          <Alert severity="error">
            Access Denied: You do not have permission to access this page.
            <br />
            访问被拒绝：您没有权限访问此页面。
          </Alert>
        </Container>
      </Box>
    );
  }

  const memberStats = getMemberStats();
  const eventStats = getEventStats();
  const donationTotals = getDonationTotals();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>

      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: { xs: 2, sm: 3 } }}>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {isAdmin ? 'Admin Dashboard' : 'Committee Dashboard'}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            {isAdmin ? '管理面板' : '委员面板'}
          </Typography>
        </Box>

        {successMessage && (
          <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage('')}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Tabbed Interface */}
        <Paper elevation={0} sx={{ ...panelSx, width: '100%', mb: 3, overflow: 'hidden' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: `1px solid ${LINE}`,
              '& .MuiTab-root': {
                minHeight: 64,
                textTransform: 'none',
                fontWeight: 500,
              },
              '& .Mui-selected': {
                color: `${ORANGE} !important`,
              },
              '& .MuiTabs-indicator': {
                backgroundColor: ORANGE,
              },
            }}
          >
            <Tab icon={<PeopleIcon />} label="Members" iconPosition="start" />
            <Tab icon={<DirectionsRunIcon />} label={`Activities${pendingActivities.length > 0 ? ` (${pendingActivities.length})` : ''}`} iconPosition="start" />
            <Tab icon={<EventIcon />} label="Events" iconPosition="start" />
            <Tab icon={<ImageIcon />} label="Banners" iconPosition="start" sx={{ display: isAdmin ? 'inline-flex' : 'none' }} />
            <Tab icon={<ViewModuleIcon />} label="Sections" iconPosition="start" sx={{ display: isAdmin ? 'inline-flex' : 'none' }} />
            <Tab icon={<EmailIcon />} label="Newsletter" iconPosition="start" />
            <Tab icon={<BarChartIcon />} label="Analytics" iconPosition="start" />
            <Tab icon={<DescriptionIcon />} label="Meeting Notes" iconPosition="start" />
            <Tab icon={<SettingsIcon />} label="Settings" iconPosition="start" />
            {isAdmin && <Tab icon={<AdminPanelSettingsIcon />} label="Committee Mgmt" iconPosition="start" />}
          </Tabs>
        </Paper>

        {/* Tab 0: Manage Members */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Pending Applications ({pendingMembers.length})
          </Typography>

          {pendingMembers.length === 0 ? (
            <Alert severity="info">
              No pending applications at this time. / 目前没有待审核的申请。
            </Alert>
          ) : (
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {pendingMembers.map((member) => (
                <Card key={member.id} elevation={0} sx={{ border: `1px solid ${ORANGE}`, borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">{member.display_name || member.username}</Typography>
                      <Chip label="Pending" color="warning" size="small" />
                    </Box>
                    <Typography color="text.secondary" gutterBottom>
                      <strong>Email:</strong> {member.email}
                    </Typography>
                    {member.nyrr_member_id && (
                      <Typography color="text.secondary" gutterBottom>
                        <strong>NYRR ID:</strong> {member.nyrr_member_id}
                      </Typography>
                    )}
                    <Typography color="text.secondary" gutterBottom>
                      <strong>Applied:</strong> {new Date(member.created_at).toLocaleString()}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleReject(member.id, member.display_name || member.username)}
                      disabled={actionLoading === member.id}
                    >
                      {actionLoading === member.id ? <CircularProgress size={20} /> : 'Reject'}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleApprove(member.id, member.display_name || member.username)}
                      disabled={actionLoading === member.id}
                      sx={orangeButtonSx}
                    >
                      {actionLoading === member.id ? <CircularProgress size={20} /> : 'Approve'}
                    </Button>
                  </CardActions>
                </Card>
              ))}
            </Box>
          )}

          <Typography variant="h5" sx={{ fontWeight: 600, mt: 5, mb: 3 }}>
            All Members ({allMembers.filter(m => m.status === 'runner' || m.status === 'admin' || m.status === 'committee').length}) + Pending ({pendingMembers.length})
          </Typography>

          <TextField
            size="small"
            placeholder="Search by name or email / 搜索姓名或邮箱"
            value={memberSearch}
            onChange={(e) => { setMemberSearch(e.target.value); setMemberPage(0); }}
            sx={{ mb: 2, width: { xs: '100%', sm: 300 } }}
          />

          {(() => {
            const memberSortHandler = (col) => () => {
              setMemberSortDirection(memberSortColumn === col && memberSortDirection === 'asc' ? 'desc' : 'asc');
              setMemberSortColumn(col);
            };
            const filtered = allMembers.filter(m => {
              if (!memberSearch) return true;
              const q = memberSearch.toLowerCase();
              return (m.display_name || m.username || '').toLowerCase().includes(q) ||
                     (m.email || '').toLowerCase().includes(q);
            });
            const sorted = [...filtered].sort((a, b) => {
              let aVal, bVal;
              switch (memberSortColumn) {
                case 'display_name':
                  aVal = (a.display_name || a.username || '').toLowerCase();
                  bVal = (b.display_name || b.username || '').toLowerCase();
                  break;
                case 'email':
                  aVal = (a.email || '').toLowerCase();
                  bVal = (b.email || '').toLowerCase();
                  break;
                case 'gender':
                  aVal = a.gender || '';
                  bVal = b.gender || '';
                  break;
                case 'status':
                  aVal = a.status || '';
                  bVal = b.status || '';
                  break;
                case 'join_date':
                  aVal = a.join_date || a.created_at || '';
                  bVal = b.join_date || b.created_at || '';
                  break;
                default:
                  aVal = '';
                  bVal = '';
              }
              if (aVal < bVal) return memberSortDirection === 'asc' ? -1 : 1;
              if (aVal > bVal) return memberSortDirection === 'asc' ? 1 : -1;
              return 0;
            });
            const paginated = sorted.slice(memberPage * memberRowsPerPage, memberPage * memberRowsPerPage + memberRowsPerPage);

            return (
              <TableContainer component={Paper} elevation={0} sx={panelSx}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: ORANGE_BG }}>
                      {[
                        { id: 'display_name', label: 'Name' },
                        { id: 'email', label: 'Email' },
                        { id: 'gender', label: 'Gender' },
                        { id: 'status', label: 'Status' },
                        { id: 'join_date', label: 'Joined' }
                      ].map(col => (
                        <TableCell key={col.id}>
                          <TableSortLabel
                            active={memberSortColumn === col.id}
                            direction={memberSortColumn === col.id ? memberSortDirection : 'asc'}
                            onClick={memberSortHandler(col.id)}
                          >
                            <strong>{col.label}</strong>
                          </TableSortLabel>
                        </TableCell>
                      ))}
                      <TableCell align="right"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((member) => (
                      <TableRow key={member.id} hover>
                        <TableCell>
                          {member.display_name || member.username}
                          {member.display_name_cn && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {member.display_name_cn}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{member.email || '-'}</TableCell>
                        <TableCell>
                          {member.gender === 'M' ? 'Male' : member.gender === 'F' ? 'Female' : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={member.status}
                            size="small"
                            color={
                              member.status === 'admin' ? 'primary' :
                              member.status === 'committee' ? 'secondary' :
                              member.status === 'runner' ? 'success' :
                              member.status === 'pending' ? 'warning' :
                              member.status === 'rejected' ? 'error' :
                              member.status === 'suspended' ? 'error' :
                              member.status === 'quit' ? 'default' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {member.join_date ? new Date(member.join_date).toLocaleDateString() :
                           member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit Member">
                            <IconButton size="small" onClick={() => handleEditMember(member)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div"
                  count={filtered.length}
                  page={memberPage}
                  onPageChange={(e, newPage) => setMemberPage(newPage)}
                  rowsPerPage={memberRowsPerPage}
                  onRowsPerPageChange={(e) => { setMemberRowsPerPage(parseInt(e.target.value, 10)); setMemberPage(0); }}
                  rowsPerPageOptions={[10, 25, 50]}
                />
              </TableContainer>
            );
          })()}
        </TabPanel>

        {/* Tab 1: Activity Verification */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Pending Activity Verification ({pendingActivities.length})
          </Typography>

          {pendingActivities.length === 0 ? (
            <Alert severity="info">
              No pending activities awaiting verification. / 没有待验证的活动。
            </Alert>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={panelSx}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: ORANGE_BG }}>
                    <TableCell><strong>Member</strong></TableCell>
                    <TableCell><strong>Activity #</strong></TableCell>
                    <TableCell><strong>Event Name</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Submitted</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingActivities.map((activity) => {
                    const member = allMembers.find(m => m.id === activity.member_id);
                    return (
                      <TableRow key={activity.id} hover>
                        <TableCell>{member?.display_name || member?.username || `Member #${activity.member_id}`}</TableCell>
                        <TableCell>
                          <Chip
                            label={`Run ${activity.activity_number}`}
                            size="small"
                            color={activity.activity_number === 1 ? 'primary' : 'secondary'}
                          />
                        </TableCell>
                        <TableCell>{activity.event_name}</TableCell>
                        <TableCell>{activity.event_date}</TableCell>
                        <TableCell>
                          {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View Details & Verify">
                            <IconButton
                              size="small"
                              onClick={() => handleViewActivityDetails(activity)}
                              color="primary"
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <IconButton
                              size="small"
                              onClick={() => handleVerifyActivity(activity.id, false, 'Activity not verified')}
                              disabled={actionLoading === `activity-${activity.id}`}
                            >
                              {actionLoading === `activity-${activity.id}` ?
                                <CircularProgress size={16} /> :
                                <CloseIcon fontSize="small" color="error" />
                              }
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Tab 2: Create/Manage Events */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Manage Events
            </Typography>
            <Button
              variant="contained"
              onClick={() => handleEventDialogOpen()}
              sx={orangeButtonSx}
            >
              + Create Event
            </Button>
          </Box>

          <TableContainer component={Paper} elevation={0} sx={panelSx}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: ORANGE_BG }}>
                  <TableCell><strong>Event Name</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Location</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{event.name}</Typography>
                        {event.chinese_name && (
                          <Typography variant="caption" color="text.secondary">{event.chinese_name}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{event.date} {event.time}</TableCell>
                    <TableCell>{event.location || 'TBD'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={event.status}
                          size="small"
                          color={
                            event.status === 'Upcoming' ? 'primary'
                            : event.status === 'Past' ? 'success'
                            : event.status === 'Cancelled' ? 'default'
                            : 'default'
                          }
                        />
                        {event.is_highlight && (
                          <Chip label="★ Highlight" size="small" color="warning" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEventDialogOpen(event)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => handleDeleteEvent(event.id, event.name)}>
                          <DeleteIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Tab 3: Manage Banners */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Manage Homepage Banners
            </Typography>
            <Button
              variant="contained"
              onClick={() => handleBannerDialogOpen()}
              sx={orangeButtonSx}
            >
              + Add Banner
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Banners appear in the carousel on the homepage. Set display order to control the sequence.
            <br />
            横幅出现在主页的轮播图中。设置显示顺序以控制序列。
          </Alert>

          <TableContainer component={Paper} elevation={0} sx={panelSx}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: ORANGE_BG }}>
                  <TableCell><strong>Preview</strong></TableCell>
                  <TableCell><strong>Label</strong></TableCell>
                  <TableCell><strong>Link</strong></TableCell>
                  <TableCell><strong>Order</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {banners.map((banner) => (
                  <TableRow key={banner.id} hover>
                    <TableCell>
                      <Box
                        component="img"
                        src={banner.image_url}
                        alt={banner.alt_text || 'Banner preview'}
                        sx={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 1 }}
                        onError={(e) => { e.target.src = '/master-image-1.jpg'; }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{banner.label_en || 'No label'}</Typography>
                        {banner.label_cn && (
                          <Typography variant="caption" color="text.secondary">{banner.label_cn}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{banner.link_path || 'No link'}</TableCell>
                    <TableCell>{banner.display_order}</TableCell>
                    <TableCell>
                      <Chip
                        label={banner.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={banner.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleBannerDialogOpen(banner)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => handleDeleteBanner(banner.id, banner.label_en)}>
                          <DeleteIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {banners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No banners configured. Add a banner to display on the homepage.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Tab 4: Manage Sections */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Manage Homepage Sections
            </Typography>
            <Button
              variant="contained"
              onClick={() => handleSectionDialogOpen()}
              sx={orangeButtonSx}
            >
              + Add Section
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Sections appear on the homepage below the banner carousel. Set display order to control the sequence.
            <br />
            板块显示在主页横幅轮播图下方。设置显示顺序以控制序列。
          </Alert>

          <TableContainer component={Paper} elevation={0} sx={panelSx}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: ORANGE_BG }}>
                  <TableCell><strong>Preview</strong></TableCell>
                  <TableCell><strong>Title (EN/CN)</strong></TableCell>
                  <TableCell><strong>Link</strong></TableCell>
                  <TableCell><strong>Order</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.map((section) => (
                  <TableRow key={section.id} hover>
                    <TableCell>
                      {section.image_url ? (
                        <Box
                          component="img"
                          src={section.image_url}
                          alt={section.title_en}
                          sx={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 1 }}
                          onError={(e) => { e.target.src = '/placeholder-section.png'; }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 100,
                            height: 60,
                            backgroundColor: '#4a4a4a',
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">No Image</Typography>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{section.title_en}</Typography>
                        {section.title_cn && (
                          <Typography variant="caption" color="text.secondary">{section.title_cn}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{section.link_path}</TableCell>
                    <TableCell>{section.display_order}</TableCell>
                    <TableCell>
                      <Chip
                        label={section.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={section.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleSectionDialogOpen(section)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => handleDeleteSection(section.id, section.title_en)}>
                          <DeleteIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {sections.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No sections configured. Add a section to display on the homepage.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Tab 5: Send Newsletter */}
        <TabPanel value={tabValue} index={5}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Send Newsletter
          </Typography>

          <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              Send a newsletter to all active members via email.
              <br />
              向所有活跃会员发送邮件通知。
            </Alert>

            <TextField
              fullWidth
              label="Subject / 主题"
              value={newsletterSubject}
              onChange={(e) => setNewsletterSubject(e.target.value)}
              margin="normal"
            />

            <TextField
              fullWidth
              label="Content / 内容"
              value={newsletterContent}
              onChange={(e) => setNewsletterContent(e.target.value)}
              margin="normal"
              multiline
              rows={8}
              placeholder="Write your newsletter content here... / 在此输入邮件内容..."
            />

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={handleSendNewsletter}
                disabled={sendingNewsletter || !newsletterSubject || !newsletterContent}
                sx={orangeButtonSx}
              >
                {sendingNewsletter ? <CircularProgress size={24} /> : 'Send Newsletter'}
              </Button>
            </Box>
          </Paper>
        </TabPanel>

        {/* Tab 6: View Analytics */}
        <TabPanel value={tabValue} index={6}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Club Analytics
          </Typography>

          <Grid container spacing={3}>
            {/* Member Stats */}
            <Grid item xs={12} md={6} lg={3}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3, textAlign: 'center', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <PeopleIcon sx={{ fontSize: 48, color: ORANGE, mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 700, color: ORANGE }}>
                  {memberStats.active}
                </Typography>
                <Typography variant="body1" color="text.secondary">Active Runners</Typography>
                <Typography variant="caption" color="text.secondary">
                  {memberStats.total} total members, {memberStats.pending} pending
                </Typography>
              </Paper>
            </Grid>

            {/* Event Stats */}
            <Grid item xs={12} md={6} lg={3}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3, textAlign: 'center', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <EventIcon sx={{ fontSize: 48, color: ORANGE, mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 700, color: ORANGE }}>
                  {eventStats.total}
                </Typography>
                <Typography variant="body1" color="text.secondary">Total Events</Typography>
                <Typography variant="caption" color="text.secondary">
                  {eventStats.upcoming} upcoming, {eventStats.highlights} highlights
                </Typography>
              </Paper>
            </Grid>

            {/* Donation Stats */}
            <Grid item xs={12} md={6} lg={3}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3, textAlign: 'center', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <AttachMoneyIcon sx={{ fontSize: 48, color: ORANGE, mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 700, color: ORANGE }}>
                  {donationTotals.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Typography>
                <Typography variant="body1" color="text.secondary">Total Donations</Typography>
                <Typography variant="caption" color="text.secondary">
                  From {donationTotals.donorCount} donors
                </Typography>
              </Paper>
            </Grid>

            {/* Leadership Stats */}
            <Grid item xs={12} md={6} lg={3}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3, textAlign: 'center', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <GroupsIcon sx={{ fontSize: 48, color: ORANGE, mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 700, color: ORANGE }}>
                  {memberStats.admins + memberStats.committee}
                </Typography>
                <Typography variant="body1" color="text.secondary">Committee & Admin</Typography>
                <Typography variant="caption" color="text.secondary">
                  Managing the club
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Donation Breakdown */}
          <Paper elevation={0} sx={{ ...panelSx, p: 3, mt: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Donation Breakdown
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, backgroundColor: ORANGE_BG, borderRadius: '12px' }}>
                  <Typography variant="body2" color="text.secondary">Individual Donations</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    ${donationTotals.individualTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, backgroundColor: ORANGE_BG, borderRadius: '12px' }}>
                  <Typography variant="body2" color="text.secondary">Enterprise Donations</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    ${donationTotals.enterpriseTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </TabPanel>

        {/* Tab 7: Meeting Minutes */}
        <TabPanel value={tabValue} index={7}>
          <MeetingMinutesEditor firebaseUid={currentUser?.uid} />
        </TabPanel>

        {/* Tab 8: Site Settings */}
        <TabPanel value={tabValue} index={8}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Site Settings / 网站设置
          </Typography>

          <Alert severity="info" sx={{ mb: 3 }}>
            Configure social media links and other site settings. Changes will be reflected immediately across the site.
            <br />
            配置社交媒体链接和其他网站设置。更改将立即在整个网站上生效。
          </Alert>

          <Paper elevation={0} sx={{ ...panelSx, p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <GroupsIcon /> Social Media Links / 社交媒体链接
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Instagram URL"
                  value={socialLinksForm.instagram}
                  onChange={(e) => setSocialLinksForm(prev => ({ ...prev, instagram: e.target.value }))}
                  placeholder="https://www.instagram.com/newbeerunningclub/"
                  helperText="Leave empty to disable / 留空以禁用"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Xiaohongshu URL / 小红书链接"
                  value={socialLinksForm.xiaohongshu}
                  onChange={(e) => setSocialLinksForm(prev => ({ ...prev, xiaohongshu: e.target.value }))}
                  placeholder="https://xhslink.com/..."
                  helperText="Leave empty to disable / 留空以禁用"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Heylo URL"
                  value={socialLinksForm.heylo}
                  onChange={(e) => setSocialLinksForm(prev => ({ ...prev, heylo: e.target.value }))}
                  placeholder="https://www.heylo.com/g/..."
                  helperText="Leave empty to disable / 留空以禁用"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Shop URL / 商店链接"
                  value={socialLinksForm.shop}
                  onChange={(e) => setSocialLinksForm(prev => ({ ...prev, shop: e.target.value }))}
                  placeholder="https://shop.newbeerunningclub.org/"
                  helperText="Leave empty to disable / 留空以禁用"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Shop Demo Video URL / 商店演示视频链接"
                  value={socialLinksForm.shopDemoVideo}
                  onChange={(e) => setSocialLinksForm(prev => ({ ...prev, shopDemoVideo: e.target.value }))}
                  placeholder="https://your-bucket.s3.amazonaws.com/shop-demo.mp4"
                  helperText="Direct video URL (S3 or other host). Shown when users click the shop icon. / 视频直链，点击商店图标时显示"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                onClick={handleSaveSettings}
                disabled={settingsLoading}
                sx={orangeButtonSx}
              >
                {settingsLoading ? <CircularProgress size={24} /> : 'Save Settings / 保存设置'}
              </Button>
              {settingsSaved && (
                <Alert severity="success" sx={{ py: 0 }}>
                  Settings saved successfully! / 设置保存成功！
                </Alert>
              )}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ ...panelSx, p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <DirectionsRunIcon /> Join Requirements / 入会要求
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Configure the minimum self-introduction length for new member applications.
              <br />
              配置新会员申请时自我介绍的最低字数要求。
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min English Words / 最少英文单词数"
                  value={joinRequirementsForm.minEnglishWords}
                  onChange={(e) => setJoinRequirementsForm(prev => ({ ...prev, minEnglishWords: e.target.value }))}
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min Chinese Characters / 最少中文字符数"
                  value={joinRequirementsForm.minChineseChars}
                  onChange={(e) => setJoinRequirementsForm(prev => ({ ...prev, minChineseChars: e.target.value }))}
                  inputProps={{ min: 0 }}
                />
              </Grid>
            </Grid>
          </Paper>
        </TabPanel>

        {/* Tab 9: Committee Management (Admin Only) */}
        {isAdmin && (
          <TabPanel value={tabValue} index={9}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
              Committee Management
            </Typography>

            <Alert severity="info" sx={{ mb: 3 }}>
              As a full admin, you can promote runners to committee status and demote committee members back to runners.
              Committee members can access most admin features but cannot manage other committee members.
            </Alert>

            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Current Committee Members ({allMembers.filter(m => m.status === 'committee').length})
            </Typography>

            <TableContainer component={Paper} elevation={0} sx={{ ...panelSx, mb: 4 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'rgba(156, 39, 176, 0.1)' }}>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Joined</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allMembers.filter(m => m.status === 'committee').map((member) => (
                    <TableRow key={member.id} hover>
                      <TableCell>{member.display_name || member.username}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Chip label="committee" size="small" color="secondary" />
                      </TableCell>
                      <TableCell>
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => handleDemoteFromCommittee(member.id, member.display_name || member.username)}
                          disabled={actionLoading === `demote-${member.id}`}
                        >
                          {actionLoading === `demote-${member.id}` ? <CircularProgress size={16} /> : 'Demote to Runner'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {allMembers.filter(m => m.status === 'committee').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No committee members yet. Promote runners from the list below.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Runners (Eligible for Promotion) ({allMembers.filter(m => m.status === 'runner').length})
            </Typography>

            <TableContainer component={Paper} elevation={0} sx={panelSx}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'rgba(76, 175, 80, 0.1)' }}>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Joined</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allMembers.filter(m => m.status === 'runner').slice(0, 20).map((member) => (
                    <TableRow key={member.id} hover>
                      <TableCell>{member.display_name || member.username}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Chip label="runner" size="small" color="success" />
                      </TableCell>
                      <TableCell>
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="contained"
                          color="secondary"
                          onClick={() => handlePromoteToCommittee(member.id, member.display_name || member.username)}
                          disabled={actionLoading === `promote-${member.id}`}
                        >
                          {actionLoading === `promote-${member.id}` ? <CircularProgress size={16} /> : 'Promote to Committee'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {allMembers.filter(m => m.status === 'runner').length > 20 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                Showing 20 of {allMembers.filter(m => m.status === 'runner').length} runners
              </Typography>
            )}
          </TabPanel>
        )}
      </Container>

      {/* Event Create/Edit Dialog */}
      <Dialog open={eventDialogOpen} onClose={handleEventDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingEvent ? 'Edit Event / 编辑活动' : 'Create Event / 创建活动'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Event Name (English)"
                name="name"
                value={eventFormData.name}
                onChange={handleEventFormChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Event Name (Chinese)"
                name="chinese_name"
                value={eventFormData.chinese_name}
                onChange={handleEventFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Date"
                name="date"
                type="date"
                value={eventFormData.date}
                onChange={handleEventFormChange}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Time"
                name="time"
                value={eventFormData.time}
                onChange={handleEventFormChange}
                placeholder="e.g., 8:00 AM"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location (English)"
                name="location"
                value={eventFormData.location}
                onChange={handleEventFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location (Chinese)"
                name="chinese_location"
                value={eventFormData.chinese_location}
                onChange={handleEventFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description (English)"
                name="description"
                value={eventFormData.description}
                onChange={handleEventFormChange}
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description (Chinese)"
                name="chinese_description"
                value={eventFormData.chinese_description}
                onChange={handleEventFormChange}
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Image URL"
                name="image"
                value={eventFormData.image}
                onChange={handleEventFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Signup Link"
                name="signup_link"
                value={eventFormData.signup_link}
                onChange={handleEventFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={eventFormData.status}
                  onChange={handleEventFormChange}
                  label="Status"
                >
                  <MenuItem value="Upcoming">Upcoming / 即将举行</MenuItem>
                  <MenuItem value="Past">Past (Memories) / 已结束（回忆）</MenuItem>
                  <MenuItem value="Cancelled">Cancelled / 已取消</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!eventFormData.is_highlight}
                    onChange={(e) =>
                      setEventFormData((prev) => ({ ...prev, is_highlight: e.target.checked }))
                    }
                    color="warning"
                  />
                }
                label="Highlight / 精选"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleEventDialogClose} disabled={actionLoading === 'event'}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEvent}
            disabled={actionLoading === 'event' || !eventFormData.name || !eventFormData.date}
            sx={orangeButtonSx}
          >
            {actionLoading === 'event' ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Banner Create/Edit Dialog */}
      <Dialog open={bannerDialogOpen} onClose={handleBannerDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingBanner ? 'Edit Banner / 编辑横幅' : 'Add Banner / 添加横幅'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Image URL / 图片链接"
                name="image_url"
                value={bannerFormData.image_url}
                onChange={handleBannerFormChange}
                required
                helperText="Use /filename.jpg for local images or full URL for external"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Label (English)"
                name="label_en"
                value={bannerFormData.label_en}
                onChange={handleBannerFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Label (Chinese)"
                name="label_cn"
                value={bannerFormData.label_cn}
                onChange={handleBannerFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Link Path / 链接路径"
                name="link_path"
                value={bannerFormData.link_path}
                onChange={handleBannerFormChange}
                placeholder="/about"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Alt Text"
                name="alt_text"
                value={bannerFormData.alt_text}
                onChange={handleBannerFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Display Order / 显示顺序"
                name="display_order"
                type="number"
                value={bannerFormData.display_order}
                onChange={handleBannerFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="is_active"
                  value={bannerFormData.is_active}
                  onChange={(e) => setBannerFormData(prev => ({ ...prev, is_active: e.target.value }))}
                  label="Status"
                >
                  <MenuItem value={true}>Active</MenuItem>
                  <MenuItem value={false}>Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleBannerDialogClose} disabled={actionLoading === 'banner'}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveBanner}
            disabled={actionLoading === 'banner' || !bannerFormData.image_url}
            sx={orangeButtonSx}
          >
            {actionLoading === 'banner' ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Section Create/Edit Dialog */}
      <Dialog open={sectionDialogOpen} onClose={handleSectionDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSection ? 'Edit Section / 编辑板块' : 'Add Section / 添加板块'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Title (English) / 标题（英文）"
                name="title_en"
                value={sectionFormData.title_en}
                onChange={handleSectionFormChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Title (Chinese) / 标题（中文）"
                name="title_cn"
                value={sectionFormData.title_cn}
                onChange={handleSectionFormChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Image URL / 图片链接"
                name="image_url"
                value={sectionFormData.image_url}
                onChange={handleSectionFormChange}
                helperText="Use /filename.jpg for local images or full URL for external"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Link Path / 链接路径"
                name="link_path"
                value={sectionFormData.link_path}
                onChange={handleSectionFormChange}
                placeholder="/event-registration"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Display Order / 显示顺序"
                name="display_order"
                type="number"
                value={sectionFormData.display_order}
                onChange={handleSectionFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="is_active"
                  value={sectionFormData.is_active}
                  onChange={(e) => setSectionFormData(prev => ({ ...prev, is_active: e.target.value }))}
                  label="Status"
                >
                  <MenuItem value={true}>Active</MenuItem>
                  <MenuItem value={false}>Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleSectionDialogClose} disabled={actionLoading === 'section'}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveSection}
            disabled={actionLoading === 'section' || !sectionFormData.title_en || !sectionFormData.link_path}
            sx={orangeButtonSx}
          >
            {actionLoading === 'section' ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Activity Details Dialog */}
      <Dialog open={activityDetailsOpen} onClose={() => setActivityDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Verify Activity / 验证活动
        </DialogTitle>
        <DialogContent>
          {selectedActivityMember && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Member: {selectedActivityMember.display_name || selectedActivityMember.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Email: {selectedActivityMember.email}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Applied: {selectedActivityMember.created_at ? new Date(selectedActivityMember.created_at).toLocaleString() : 'N/A'}
              </Typography>
            </Box>
          )}

          {selectedActivity && (
            <Paper elevation={0} sx={{ p: 2, mb: 3, backgroundColor: ORANGE_BG, border: `1px solid ${LINE}`, borderRadius: '12px' }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Activity #{selectedActivity.activity_number}
              </Typography>
              <Typography variant="body2"><strong>Event:</strong> {selectedActivity.event_name}</Typography>
              <Typography variant="body2"><strong>Date:</strong> {selectedActivity.event_date}</Typography>
              {selectedActivity.description && (
                <Typography variant="body2"><strong>Description:</strong> {selectedActivity.description}</Typography>
              )}
              {selectedActivity.proof_url && (
                <Typography variant="body2">
                  <strong>Proof:</strong>{' '}
                  <a href={selectedActivity.proof_url} target="_blank" rel="noopener noreferrer">
                    View Proof
                  </a>
                </Typography>
              )}
            </Paper>
          )}

          {selectedMemberActivities.length > 0 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                All Activities for this Member:
              </Typography>
              {selectedMemberActivities.map(act => (
                <Chip
                  key={act.id}
                  label={`Run ${act.activity_number}: ${act.status}`}
                  size="small"
                  color={
                    act.status === 'verified' ? 'success' :
                    act.status === 'pending' ? 'warning' : 'error'
                  }
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setActivityDetailsOpen(false)}>
            Cancel / 取消
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => selectedActivity && handleVerifyActivity(selectedActivity.id, false, 'Activity could not be verified')}
            disabled={actionLoading === `activity-${selectedActivity?.id}`}
          >
            {actionLoading === `activity-${selectedActivity?.id}` ? <CircularProgress size={20} /> : 'Reject / 拒绝'}
          </Button>
          <Button
            variant="contained"
            onClick={() => selectedActivity && handleVerifyActivity(selectedActivity.id, true)}
            disabled={actionLoading === `activity-${selectedActivity?.id}`}
            sx={{ backgroundColor: '#4CAF50', borderRadius: '99px', textTransform: 'none', fontWeight: 600, '&:hover': { backgroundColor: '#45a049' } }}
          >
            {actionLoading === `activity-${selectedActivity?.id}` ? <CircularProgress size={20} /> : 'Verify / 验证'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={handleCancelAction}>
        <DialogTitle>
          {confirmDialog.action === 'approve' ? 'Approve Application?' :
           confirmDialog.action === 'deleteEvent' ? 'Delete Event?' :
           confirmDialog.action === 'deleteBanner' ? 'Delete Banner?' :
           confirmDialog.action === 'deleteSection' ? 'Delete Section?' : 'Confirm Action'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDialog.action === 'approve' && (
              <>Are you sure you want to approve {confirmDialog.name}'s application?</>
            )}
            {confirmDialog.action === 'deleteEvent' && (
              <>Are you sure you want to delete the event "{confirmDialog.name}"? This action cannot be undone.</>
            )}
            {confirmDialog.action === 'deleteBanner' && (
              <>Are you sure you want to delete the banner "{confirmDialog.name}"? This action cannot be undone.</>
            )}
            {confirmDialog.action === 'deleteSection' && (
              <>Are you sure you want to delete the section "{confirmDialog.name}"? This action cannot be undone.</>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelAction}>Cancel</Button>
          <Button
            onClick={handleConfirmAction}
            variant="contained"
            color={confirmDialog.action === 'approve' ? 'primary' : 'error'}
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialog.open} onClose={handleCancelReject} maxWidth="sm" fullWidth>
        <DialogTitle>
          Reject Application 拒绝申请
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            You are about to reject {rejectDialog.name}'s application. Please provide a reason for rejection. This will be sent to the applicant via email.
          </DialogContentText>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
            您即将拒绝 {rejectDialog.name} 的申请。请提供拒绝原因，此原因将通过电子邮件发送给申请人。
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={4}
            label="Rejection Reason / 拒绝原因"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Please explain why this application is being rejected..."
            required
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelReject}>Cancel / 取消</Button>
          <Button
            onClick={handleConfirmReject}
            variant="contained"
            color="error"
            disabled={!rejectionReason.trim() || actionLoading === rejectDialog.id}
          >
            {actionLoading === rejectDialog.id ? <CircularProgress size={20} /> : 'Reject / 拒绝'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editMemberDialogOpen} onClose={() => setEditMemberDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Member / 编辑会员
          <IconButton onClick={() => setEditMemberDialogOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="NYRR Registered Name"
                value={editMemberFormData.display_name || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, display_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Display Name (CN)"
                value={editMemberFormData.display_name_cn || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, display_name_cn: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                value={editMemberFormData.email || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Gender</InputLabel>
                <Select
                  value={editMemberFormData.gender || ''}
                  onChange={(e) => setEditMemberFormData(prev => ({ ...prev, gender: e.target.value }))}
                  label="Gender"
                >
                  <MenuItem value="">Not specified</MenuItem>
                  <MenuItem value="M">Male</MenuItem>
                  <MenuItem value="F">Female</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Birth Year"
                value={editMemberFormData.birth_year || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, birth_year: e.target.value }))}
                inputProps={{ min: 1900, max: 2020 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                value={editMemberFormData.phone || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="NYRR Runner ID"
                value={editMemberFormData.nyrr_member_id || ''}
                onChange={(e) => setEditMemberFormData(prev => ({ ...prev, nyrr_member_id: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={editMemberFormData.status || ''}
                  onChange={(e) => setEditMemberFormData(prev => ({ ...prev, status: e.target.value }))}
                  label="Status"
                >
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="runner">Runner</MenuItem>
                  <MenuItem value="committee">Committee</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="suspended">Suspended</MenuItem>
                  <MenuItem value="quit">Quit</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditMemberDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveMember}
            disabled={actionLoading === editingMember?.id}
            sx={orangeButtonSx}
          >
            {actionLoading === editingMember?.id ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
