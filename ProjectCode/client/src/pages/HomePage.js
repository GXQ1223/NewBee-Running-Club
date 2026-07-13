import {
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CropIcon from '@mui/icons-material/Crop';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snackbar, Alert } from '@mui/material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import EventModal from '../components/EventModal';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getCarouselBanners } from '../api/banners';
import { updateBanner } from '../api/banners';
import { getActiveSections, updateSection, reorderSections, uploadImage } from '../api/homepageSections';
import ImagePositionEditor from '../components/ImagePositionEditor';
import { updateEvent, getEventsByStatus } from '../api';
import { ORANGE, ORANGE_BG, LINE, MUTED } from '../theme/tokens';
import { parseBubbleDate as parseEventDate } from '../helpers/eventDate';

// Fallback carousel images if API fails
const fallbackCarouselImages = [
  {
    id: 1,
    image_url: '/master-image-1.jpg',
    alt_text: 'NewBee Running Club - About Us',
    link_path: '/about',
    label_en: 'About Us',
    label_cn: '关于我们',
    source_type: 'manual'
  },
  {
    id: 2,
    image_url: '/master-image-3.jpg',
    alt_text: 'NewBee Running Club - Upcoming Events',
    link_path: '/calendar',
    label_en: 'Upcoming',
    label_cn: '即将到来',
    source_type: 'manual'
  }
];

// Fallback sections if API fails
const fallbackSections = [
  { id: 1, title_en: 'Event Registration', title_cn: '活动报名', link_path: '/calendar', image_url: '/EventRegistration.png' },
  { id: 2, title_en: 'Memories', title_cn: '回忆', link_path: '/highlights', image_url: '/Highlights.png' },
  { id: 3, title_en: 'Upcoming', title_cn: '即将到来', link_path: '/calendar', image_url: null },
  { id: 4, title_en: 'Club Credits/Records', title_cn: '俱乐部积分/记录', link_path: '/records', image_url: null },
  { id: 5, title_en: 'Join NewBee', title_cn: '加入新蜂', link_path: '/join', image_url: null }
  // Training With Us ('/training') hidden for now — restore an entry here (and
  // reactivate the DB section in admin mode) to bring it back
];

// Sortable Section Card — featured grid card with title overlaid on the image.
// The first two sections render as large (span-2) cards.
function SortableSection({ section, isBig, adminModeEnabled, onEdit, onPositionEdit, upcomingEvents }) {
  const [isHovered, setIsHovered] = useState(false);
  const [eventImageIndex, setEventImageIndex] = useState(0);

  // For Event Registration section: cycle through upcoming event images
  const isEventRegistration = section.link_path === '/calendar' && section.title_en === 'Event Registration';
  const eventsWithImages = isEventRegistration
    ? (upcomingEvents || []).filter(ev => ev.image_url || ev.poster_url)
    : [];

  useEffect(() => {
    if (eventsWithImages.length <= 1) return;
    const interval = setInterval(() => {
      setEventImageIndex(prev => (prev + 1) % eventsWithImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [eventsWithImages.length]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      component="a"
      href={isEventRegistration && eventsWithImages.length > 0
        ? `/calendar?event=${eventsWithImages[eventImageIndex].id}`
        : section.link_path}
      sx={{
        gridColumn: isBig ? 'span 2' : 'auto',
        height: isBig ? { xs: '200px', md: '250px' } : { xs: '150px', md: '170px' },
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        cursor: 'pointer',
        display: 'block',
        textDecoration: 'none',
        backgroundColor: '#4a4a4a',
        boxShadow: isHovered
          ? '0 8px 24px rgba(255, 165, 0, 0.35)'
          : '0 2px 4px rgba(0, 0, 0, 0.08)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
      }}
    >
      {isEventRegistration && eventsWithImages.length > 0 ? (
        /* Event Registration: cycle through upcoming event images */
        <>
          {eventsWithImages.map((ev, index) => (
            <Box
              key={ev.id}
              component="img"
              src={ev.poster_url || ev.image_url}
              alt={ev.title || ev.name}
              loading="lazy"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: ev.image_position || 'center center',
                position: 'absolute',
                top: 0,
                left: 0,
                opacity: index === eventImageIndex ? 1 : 0,
                transition: 'opacity 1s ease-in-out, transform 0.3s ease',
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ))}
          {/* Open registration badge */}
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              backgroundColor: ORANGE,
              color: 'white',
              fontSize: '0.6875rem',
              fontWeight: 700,
              px: 1.5,
              py: 0.5,
              borderRadius: '99px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              zIndex: 3,
            }}
          >
            Open 报名中
          </Box>
        </>
      ) : section.image_url ? (
        <Box
          component="img"
          src={section.image_url}
          alt={section.title_en}
          loading="lazy"
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: section.image_position || 'center center',
            transition: 'transform 0.3s ease',
            transform: isHovered ? 'scale(1.04)' : 'scale(1)',
          }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textAlign: 'center', px: 2 }}>
            {section.title_en} Image Coming Soon
          </Typography>
        </Box>
      )}

      {/* Title overlay — always visible */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 65%, transparent 100%)',
          px: 2,
          pt: 3,
          pb: 1.5,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography
            sx={{
              color: 'white',
              fontWeight: 600,
              fontSize: isBig ? { xs: '1rem', md: '1.25rem' } : { xs: '0.875rem', md: '0.9375rem' },
              lineHeight: 1.3,
              textShadow: '1px 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {section.title_en}
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: { xs: '0.6875rem', md: '0.75rem' },
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {section.title_cn}
          </Typography>
        </Box>
        <ArrowForwardIcon
          sx={{
            color: ORANGE,
            fontSize: '1.25rem',
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateX(0)' : 'translateX(-4px)',
            transition: 'all 0.2s ease',
          }}
        />
      </Box>

      {/* Admin controls */}
      {adminModeEnabled && (
        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5, zIndex: 10 }}>
          {section.image_url && (
            <Tooltip title="Adjust image position / 调整图片位置">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onPositionEdit) onPositionEdit(section);
                }}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  '&:hover': { backgroundColor: 'white' },
                }}
              >
                <CropIcon fontSize="small" sx={{ color: '#FFB84D' }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Edit Section">
            <IconButton
              onClick={(e) => onEdit(e, section)}
              sx={{
                backgroundColor: 'rgba(255, 165, 0, 0.9)',
                color: 'white',
                '&:hover': { backgroundColor: '#FF8C00' },
              }}
              size="small"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      {adminModeEnabled && (
        <Tooltip title="Drag to reorder">
          <IconButton
            {...attributes}
            {...listeners}
            onClick={(e) => e.preventDefault()}
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 10,
              cursor: 'grab',
              color: ORANGE,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              '&:hover': { backgroundColor: 'white' },
              '&:active': { cursor: 'grabbing' },
            }}
            size="small"
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export default function HomePage() {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [carouselImages, setCarouselImages] = useState([]);
  const [sections, setSections] = useState([]);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [editFormData, setEditFormData] = useState({
    title_en: '',
    title_cn: '',
    image_url: '',
    image_position: '',
    link_path: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [carouselPositionEditing, setCarouselPositionEditing] = useState(false);
  const [sectionPositionEditing, setSectionPositionEditing] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const navigate = useNavigate();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch carousel banners and sections independently
  useEffect(() => {
    getCarouselBanners()
      .then(data => setCarouselImages(data.length > 0 ? data : fallbackCarouselImages))
      .catch(() => setCarouselImages(fallbackCarouselImages))
      .finally(() => setCarouselLoading(false));

    getActiveSections()
      .then(data => setSections(data.length > 0 ? data : fallbackSections))
      .catch(() => setSections(fallbackSections))
      .finally(() => setSectionsLoading(false));

    getEventsByStatus('Upcoming')
      .then(data => setUpcomingEvents(data || []))
      .catch(() => setUpcomingEvents([]));
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    if (carouselImages.length === 0) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === carouselImages.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [carouselImages.length]);

  const openBanner = (banner) => {
    if (!banner) return;
    // If banner is linked to an event, open event modal
    if (banner.event_id || banner.source_type === 'event_highlight') {
      setSelectedEvent(banner);
      setEventModalOpen(true);
    } else if (banner.link_path) {
      // Otherwise navigate to the link path
      navigate(banner.link_path);
    }
  };

  const handleBannerClick = () => {
    openBanner(carouselImages[currentImageIndex]);
  };

  const handleCloseEventModal = () => {
    setEventModalOpen(false);
    setSelectedEvent(null);
  };

  // Section edit handlers
  const handleEditSection = (e, section) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSection(section);
    setEditFormData({
      title_en: section.title_en || '',
      title_cn: section.title_cn || '',
      image_url: section.image_url || '',
      image_position: section.image_position || '',
      link_path: section.link_path || '',
      is_active: section.is_active !== false
    });
    setSelectedFile(null);
    setImagePreview(section.image_url || null);
    setEditDialogOpen(true);
  };

  const handleEditDialogClose = () => {
    setEditDialogOpen(false);
    setEditingSection(null);
    setSelectedFile(null);
    setImagePreview(null);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      // Revoke previous blob URL to prevent memory leak
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const handleRemoveImage = () => {
    // Revoke blob URL to prevent memory leak
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedFile(null);
    setImagePreview(null);
    setEditFormData(prev => ({ ...prev, image_url: '' }));
  };

  const handleSaveSection = async () => {
    if (!editingSection || !currentUser) return;
    setSaving(true);

    try {
      let imageUrl = editFormData.image_url;
      let imageChanged = false;

      // Upload new image if selected
      if (selectedFile) {
        setUploading(true);
        try {
          const uploadResult = await uploadImage(selectedFile, currentUser.uid);
          imageUrl = uploadResult.url;
          imageChanged = true;
        } catch (uploadErr) {
          console.error('Error uploading image:', uploadErr);
          setSnackbar({ open: true, message: 'Failed to upload image / 上传图片失败', severity: 'error' });
          setSaving(false);
          setUploading(false);
          return;
        }
        setUploading(false);
      } else if (imageUrl !== editingSection.image_url) {
        // Image was removed or URL was manually changed
        imageChanged = true;
      }

      // Only send fields that changed — avoid sending massive base64 image_url back
      const dataToSave = {
        title_en: editFormData.title_en,
        title_cn: editFormData.title_cn,
        link_path: editFormData.link_path,
        is_active: editFormData.is_active,
        image_position: editFormData.image_position || null,
      };
      if (imageChanged) {
        dataToSave.image_url = imageUrl || null;
      }

      const updated = await updateSection(editingSection.id, dataToSave, currentUser.uid);
      setSections(prev => prev.map(s => s.id === editingSection.id ? updated : s));
      handleEditDialogClose();
    } catch (err) {
      console.error('Error saving section:', err);
      setSnackbar({ open: true, message: 'Failed to save section / 保存板块失败', severity: 'error' });
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Handle drag end for reordering
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);

    const newSections = arrayMove(sections, oldIndex, newIndex);
    setSections(newSections);

    // Save new order to backend
    if (currentUser) {
      try {
        const sectionIds = newSections.map(s => s.id);
        await reorderSections(sectionIds, currentUser.uid);
      } catch (err) {
        console.error('Error saving section order:', err);
        // Revert on error
        setSections(sections);
        setSnackbar({ open: true, message: 'Failed to reorder sections / 排序失败', severity: 'error' });
      }
    }
  };

  const currentBanner = carouselImages[currentImageIndex];

  const renderSectionCard = (section, index) => (
    <SortableSection
      key={section.id}
      section={section}
      isBig={index < 2}
      adminModeEnabled={adminModeEnabled}
      onEdit={handleEditSection}
      onPositionEdit={(s) => setSectionPositionEditing(s)}
      upcomingEvents={upcomingEvents}
    />
  );

  const sectionsGridSx = {
    display: 'grid',
    gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
    gap: 2,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Full-width club photo banner */}
      <Box sx={{ position: 'relative', height: { xs: '220px', sm: '300px', md: '420px' }, overflow: 'hidden' }}>
        <Box
          component="img"
          src="/master-image-2.jpg"
          alt="NewBee Running Club"
          onError={(e) => { e.target.src = '/master-image-1.jpg'; }}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 35%',
            display: 'block',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.3) 100%)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 2,
          }}
        >
          <Typography
            variant="h1"
            sx={{
              color: 'white',
              fontWeight: 900,
              fontSize: { xs: '1.875rem', sm: '2.75rem', md: '3.5rem' },
              letterSpacing: '-0.015em',
              textShadow: '2px 3px 12px rgba(0,0,0,0.55)',
            }}
          >
            NewBee Running Club
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.95)',
              fontSize: { xs: '0.9375rem', md: '1.25rem' },
              mt: 1,
              textShadow: '1px 1px 6px rgba(0,0,0,0.55)',
            }}
          >
            纽约新蜂跑团 · 一起奔跑，一起成长
          </Typography>
          <Box sx={{ width: 64, height: 4, borderRadius: 2, backgroundColor: ORANGE, mt: 2.25 }} />
        </Box>
      </Box>

      {/* Fold: event carousel + latest events calendar panel */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 2 }}>
        {carouselLoading ? (
          <Box sx={{
            width: '100%',
            height: { xs: '260px', md: '440px' },
            borderRadius: '12px',
            backgroundColor: '#e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <CircularProgress sx={{ color: ORANGE }} />
          </Box>
        ) : carouselImages.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
              gap: 2,
              alignItems: 'stretch',
            }}
          >
            {/* Carousel */}
            <Box
              onClick={handleBannerClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              sx={{
                width: '100%',
                height: { xs: '260px', sm: '350px', md: '440px' },
                overflow: 'hidden',
                position: 'relative',
                borderRadius: '12px',
                boxShadow: isHovered
                  ? '0 8px 24px rgba(255, 165, 0, 0.3)'
                  : '0 2px 4px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                transform: isHovered ? 'scale(1.005)' : 'scale(1)',
                '&:active': {
                  transform: 'scale(0.995)',
                },
              }}
            >
              {carouselImages.map((image, index) => (
                <Box
                  key={image.id || index}
                  component="img"
                  src={image.image_url}
                  alt={image.alt_text || image.label_en}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: image.image_position || 'center center',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    opacity: index === currentImageIndex ? 1 : 0,
                    transition: 'opacity 1s ease-in-out, filter 0.3s ease',
                    filter: isHovered ? 'brightness(0.85)' : 'brightness(1)',
                  }}
                  onError={(e) => {
                    e.target.src = '/master-image-1.jpg';
                  }}
                />
              ))}

              {/* Label overlay — always visible */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 55%, transparent 100%)',
                  padding: { xs: 2, sm: 3 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{
                        color: 'white',
                        fontWeight: 600,
                        fontSize: { xs: '1.125rem', sm: '1.375rem', md: '1.5rem' },
                        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                      }}
                    >
                      {currentBanner?.label_en || currentBanner?.event_name}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        color: 'rgba(255,255,255,0.9)',
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {currentBanner?.label_cn || currentBanner?.event_chinese_name}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon
                    sx={{
                      color: ORANGE,
                      fontSize: { xs: '1.5rem', sm: '2rem' },
                      transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                      transition: 'transform 0.3s ease',
                    }}
                  />
                </Box>
              </Box>

              {/* Carousel Indicators */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: { xs: 8, sm: 12 },
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: 1,
                  zIndex: 2,
                }}
              >
                {carouselImages.map((_, index) => (
                  <Box
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(index);
                    }}
                    sx={{
                      width: { xs: 8, sm: 10 },
                      height: { xs: 8, sm: 10 },
                      borderRadius: '50%',
                      backgroundColor: index === currentImageIndex ? ORANGE : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s ease, transform 0.2s ease',
                      '&:hover': {
                        transform: 'scale(1.2)',
                        backgroundColor: index === currentImageIndex ? ORANGE : 'rgba(255,255,255,0.8)',
                      },
                    }}
                  />
                ))}
              </Box>

              {/* Admin: crop button to open position editor dialog */}
              {adminModeEnabled && carouselImages[currentImageIndex] && (
                <Tooltip title="Adjust image position / 调整图片位置">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCarouselPositionEditing(true);
                    }}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      '&:hover': { backgroundColor: 'white' },
                      zIndex: 10,
                    }}
                  >
                    <CropIcon fontSize="small" sx={{ color: '#FFB84D' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            {/* Latest Events calendar panel */}
            <Box
              sx={{
                backgroundColor: 'white',
                border: `1px solid ${LINE}`,
                borderRadius: '12px',
                p: 2.25,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                minHeight: { xs: 'auto', md: '440px' },
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', mb: 0.5 }}>
                Latest Events
                <Box component="span" sx={{ ml: 1, fontWeight: 400, fontSize: '0.78rem', color: MUTED }}>
                  最新活动
                </Box>
              </Typography>

              {carouselImages.slice(0, 5).map((banner, index) => {
                const date = parseEventDate(banner.event_date);
                const isActive = index === currentImageIndex;
                return (
                  <Box
                    key={banner.id || index}
                    onClick={() => {
                      setCurrentImageIndex(index);
                      openBanner(banner);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1.25,
                      px: 0.75,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      backgroundColor: isActive ? ORANGE_BG : 'transparent',
                      borderTop: index > 0 ? `1px solid ${LINE}` : 'none',
                      transition: 'background-color 0.15s ease',
                      '&:hover': { backgroundColor: ORANGE_BG },
                      '&:hover .go-arrow': { opacity: 1 },
                    }}
                  >
                    {date ? (
                      <Box
                        sx={{
                          width: 46,
                          height: 46,
                          borderRadius: '12px',
                          backgroundColor: ORANGE_BG,
                          flexShrink: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: ORANGE, lineHeight: 1.1 }}>
                          {date.day}
                        </Typography>
                        <Typography sx={{ fontSize: '0.59rem', fontWeight: 700, letterSpacing: '0.1em', color: MUTED }}>
                          {date.month}
                        </Typography>
                      </Box>
                    ) : (
                      <Box
                        component="img"
                        src={banner.image_url}
                        alt=""
                        sx={{ width: 46, height: 46, borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }}
                        onError={(e) => { e.target.style.visibility = 'hidden'; }}
                      />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {banner.label_en || banner.event_name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: MUTED }} noWrap>
                        {banner.label_cn || banner.event_chinese_name}
                      </Typography>
                    </Box>
                    <ArrowForwardIcon
                      className="go-arrow"
                      sx={{ ml: 'auto', color: ORANGE, fontSize: '1rem', opacity: 0, transition: 'opacity 0.15s ease', flexShrink: 0 }}
                    />
                  </Box>
                );
              })}

              <Button
                onClick={() => navigate('/calendar')}
                sx={{
                  mt: 'auto',
                  pt: 1,
                  textTransform: 'none',
                  color: ORANGE,
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  border: `1.5px solid ${ORANGE}`,
                  borderRadius: '99px',
                  py: 1,
                  '&:hover': {
                    backgroundColor: ORANGE,
                    color: 'white',
                  },
                }}
              >
                View Calendar 查看日历 →
              </Button>
            </Box>
          </Box>
        )}
      </Container>

      {/* Explore NewBee — featured sections grid */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 4, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
            Explore NewBee
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            探索新蜂
          </Typography>
        </Box>

        {sectionsLoading ? (
          <Box sx={sectionsGridSx}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Box
                key={i}
                sx={{
                  gridColumn: i < 2 ? 'span 2' : 'auto',
                  height: i < 2 ? { xs: '200px', md: '250px' } : { xs: '150px', md: '170px' },
                  borderRadius: '12px',
                  backgroundColor: '#e0e0e0',
                }}
              />
            ))}
          </Box>
        ) : adminModeEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map(s => s.id)}
              strategy={rectSortingStrategy}
            >
              <Box sx={sectionsGridSx}>
                {sections.map(renderSectionCard)}
              </Box>
            </SortableContext>
          </DndContext>
        ) : (
          <Box sx={sectionsGridSx}>
            {sections.map(renderSectionCard)}
          </Box>
        )}
      </Container>

      {/* Carousel Position Editor Dialog */}
      {carouselPositionEditing && carouselImages[currentImageIndex] && (
        <Dialog
          open={carouselPositionEditing}
          onClose={() => setCarouselPositionEditing(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ color: '#FFA500', fontWeight: 600 }}>
            Adjust Image Position / 调整图片位置
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Click the crop icon, then drag the image to adjust its position. / 点击裁剪图标，然后拖动图片调整位置。
            </Typography>
            <ImagePositionEditor
              imageUrl={carouselImages[currentImageIndex].image_url}
              currentPosition={carouselImages[currentImageIndex].image_position || 'center center'}
              onSave={async (position) => {
                const img = carouselImages[currentImageIndex];
                if (img.source_type === 'event_highlight' && img.event_id) {
                  await updateEvent(img.event_id, { image_position: position }, currentUser.uid);
                } else if (img.id > 0) {
                  await updateBanner(img.id, { image_position: position }, currentUser.uid);
                }
              }}
              onPositionSaved={(position) => {
                setCarouselImages(prev => prev.map((img, idx) =>
                  idx === currentImageIndex ? { ...img, image_position: position } : img
                ));
                setCarouselPositionEditing(false);
              }}
              sx={{
                width: '100%',
                height: { xs: '200px', sm: '300px', md: '400px' },
                borderRadius: '8px',
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCarouselPositionEditing(false)}>
              Close / 关闭
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Section Position Editor Dialog */}
      {sectionPositionEditing && (
        <Dialog
          open={!!sectionPositionEditing}
          onClose={() => setSectionPositionEditing(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ color: '#FFA500', fontWeight: 600 }}>
            Adjust Image Position / 调整图片位置
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Click the crop icon, then drag the image to adjust its position. / 点击裁剪图标，然后拖动图片调整位置。
            </Typography>
            <ImagePositionEditor
              imageUrl={sectionPositionEditing.image_url}
              currentPosition={sectionPositionEditing.image_position || 'center center'}
              onSave={async (position) => {
                await updateSection(sectionPositionEditing.id, { image_position: position }, currentUser.uid);
              }}
              onPositionSaved={(position) => {
                setSections(prev => prev.map(s =>
                  s.id === sectionPositionEditing.id ? { ...s, image_position: position } : s
                ));
                setSectionPositionEditing(null);
              }}
              sx={{
                width: '100%',
                height: { xs: '200px', sm: '300px', md: '400px' },
                borderRadius: '8px',
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSectionPositionEditing(null)}>
              Close / 关闭
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Event Modal */}
      <EventModal
        open={eventModalOpen}
        onClose={handleCloseEventModal}
        event={selectedEvent}
      />

      {/* Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Section Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#FFA500', fontWeight: 600 }}>
          Edit Section / 编辑板块
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Title (English) / 标题（英文）"
              name="title_en"
              value={editFormData.title_en}
              onChange={handleEditFormChange}
              required
            />
            <TextField
              fullWidth
              label="Title (Chinese) / 标题（中文）"
              name="title_cn"
              value={editFormData.title_cn}
              onChange={handleEditFormChange}
            />

            {/* Image Upload Section */}
            <Box sx={{ border: '1px dashed #ccc', borderRadius: 2, p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#666' }}>
                Section Image / 板块图片
              </Typography>

              {/* Image Preview */}
              {imagePreview && (
                <Box sx={{ mb: 2 }}>
                  <Box
                    component="img"
                    src={imagePreview}
                    alt="Preview"
                    sx={{
                      width: '100%',
                      height: 150,
                      objectFit: 'cover',
                      borderRadius: 1,
                      mb: 1,
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </Box>
              )}

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                {/* File Upload Button */}
                <Button
                  variant="outlined"
                  component="label"
                  sx={{ flex: 1, borderColor: '#FFA500', color: '#FFA500' }}
                >
                  {selectedFile ? 'Change Image / 更换图片' : imagePreview ? 'Change Image / 更换图片' : 'Upload Image / 上传图片'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </Button>

                {/* Remove Button - only show when there's an image */}
                {imagePreview && (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={handleRemoveImage}
                  >
                    Remove / 删除
                  </Button>
                )}
              </Box>

              {selectedFile && (
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#666' }}>
                  Selected: {selectedFile.name}
                </Typography>
              )}

              {uploading && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  <Typography variant="caption">Uploading...</Typography>
                </Box>
              )}
            </Box>

            <TextField
              fullWidth
              label="Link Path / 链接路径"
              name="link_path"
              value={editFormData.link_path}
              onChange={handleEditFormChange}
              placeholder="/event-registration"
              required
            />
            <FormControl fullWidth>
              <InputLabel>Status / 状态</InputLabel>
              <Select
                name="is_active"
                value={editFormData.is_active}
                onChange={(e) => setEditFormData(prev => ({ ...prev, is_active: e.target.value }))}
                label="Status / 状态"
              >
                <MenuItem value={true}>Active / 显示</MenuItem>
                <MenuItem value={false}>Inactive / 隐藏</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleEditDialogClose} disabled={saving || uploading}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveSection}
            disabled={saving || uploading || !editFormData.title_en || !editFormData.link_path}
            sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#FF8C00' } }}
          >
            {saving || uploading ? <CircularProgress size={24} /> : 'Save / 保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
