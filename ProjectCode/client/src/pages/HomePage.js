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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NavigationButtons from '../components/NavigationButtons';
import EventModal from '../components/EventModal';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getCarouselBanners } from '../api/banners';
import { updateBanner } from '../api/banners';
import { getActiveSections, updateSection, reorderSections, uploadImage } from '../api/homepageSections';
import ImagePositionEditor from '../components/ImagePositionEditor';
import { updateEvent, getEventsByStatus } from '../api';

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
  { id: 5, title_en: 'Join NewBee', title_cn: '加入新蜂', link_path: '/join', image_url: null },
  { id: 6, title_en: 'Training With Us', title_cn: '与我们训练', link_path: '/training', image_url: null }
];

// Sortable Section Component
function SortableSection({ section, adminModeEnabled, onEdit, onPositionEdit, upcomingEvents }) {
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
    <Box ref={setNodeRef} style={style} sx={{ mt: { xs: 2, sm: 3 } }}>
      {/* Section Title - Above Image */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mb: { xs: 1, sm: 1.5 } }}>
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Drag Handle - Only for admins */}
          {adminModeEnabled && (
            <Tooltip title="Drag to reorder">
              <IconButton
                {...attributes}
                {...listeners}
                sx={{
                  position: 'absolute',
                  left: 0,
                  cursor: 'grab',
                  color: '#FFA500',
                  '&:active': { cursor: 'grabbing' },
                }}
                size="small"
              >
                <DragIndicatorIcon />
              </IconButton>
            </Tooltip>
          )}
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: '#FFA500',
              fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
              textAlign: 'center'
            }}
          >
            {section.title_en}
            <br />
            {section.title_cn}
          </Typography>
          {/* Admin Edit Button */}
          {adminModeEnabled && (
            <Tooltip title="Edit Section">
              <IconButton
                onClick={(e) => onEdit(e, section)}
                sx={{
                  position: 'absolute',
                  right: 0,
                  backgroundColor: 'rgba(255, 165, 0, 0.9)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#FF8C00',
                  },
                }}
                size="small"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Container>

      {/* Section Image/Link */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 } }}>
        <Box
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={{
            width: '100%',
            height: { xs: '200px', sm: '350px', md: '500px' },
            overflow: 'hidden',
            position: 'relative',
            borderRadius: { xs: '8px', sm: '12px' },
            cursor: 'pointer',
            backgroundColor: '#4a4a4a',
            display: (isEventRegistration ? eventsWithImages.length > 0 : section.image_url) ? 'block' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isHovered
              ? '0 8px 24px rgba(255, 165, 0, 0.3)'
              : '0 2px 4px rgba(0, 0, 0, 0.1)',
            transition: 'box-shadow 0.3s ease, transform 0.3s ease',
            transform: isHovered ? 'scale(1.005)' : 'scale(1)',
            '&:active': {
              transform: 'scale(0.995)',
            },
          }}
          component="a"
          href={isEventRegistration && eventsWithImages.length > 0
            ? `/calendar?event=${eventsWithImages[eventImageIndex].id}`
            : section.link_path}
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
                    transition: 'opacity 1s ease-in-out, filter 0.3s ease',
                    borderRadius: { xs: '8px', sm: '12px' },
                    filter: isHovered ? 'brightness(0.85)' : 'brightness(1)',
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ))}
              {/* Dot indicators */}
              {eventsWithImages.length > 1 && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: { xs: 50, sm: 65, md: 80 },
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 1,
                    zIndex: 5,
                  }}
                >
                  {eventsWithImages.map((_, index) => (
                    <Box
                      key={index}
                      sx={{
                        width: { xs: 8, sm: 10 },
                        height: { xs: 8, sm: 10 },
                        borderRadius: '50%',
                        backgroundColor: index === eventImageIndex ? '#FFA500' : 'rgba(255,255,255,0.5)',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'scale(1.2)',
                          backgroundColor: index === eventImageIndex ? '#FFA500' : 'rgba(255,255,255,0.8)',
                        },
                      }}
                    />
                  ))}
                </Box>
              )}
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
                borderRadius: { xs: '8px', sm: '12px' },
                transition: 'filter 0.3s ease',
                filter: isHovered ? 'brightness(0.85)' : 'brightness(1)',
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: { xs: '1rem', sm: '1.5rem' },
                textAlign: 'center'
              }}
            >
              {section.title_en} Image Coming Soon
            </Typography>
          )}

          {/* Hover Overlay with Label */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
              padding: { xs: 2, sm: 3, md: 4 },
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.3s ease',
              borderRadius: { xs: '0 0 8px 8px', sm: '0 0 12px 12px' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography
                  variant="h5"
                  sx={{
                    color: 'white',
                    fontWeight: 600,
                    fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' },
                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                  }}
                >
                  {section.title_en}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: { xs: '0.875rem', sm: '1rem', md: '1.125rem' },
                    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                  }}
                >
                  {section.title_cn}
                </Typography>
              </Box>
              <ArrowForwardIcon
                sx={{
                  color: '#FFA500',
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'transform 0.3s ease',
                }}
              />
            </Box>
          </Box>

          {/* Admin: crop button for section image position */}
          {adminModeEnabled && section.image_url && (
            <Tooltip title="Adjust image position / 调整图片位置">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onPositionEdit) onPositionEdit(section);
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
      </Container>
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

  const handleBannerClick = () => {
    const currentImage = carouselImages[currentImageIndex];
    if (!currentImage) return;

    // If banner is linked to an event, open event modal
    if (currentImage.event_id || currentImage.source_type === 'event_highlight') {
      setSelectedEvent(currentImage);
      setEventModalOpen(true);
    } else if (currentImage.link_path) {
      // Otherwise navigate to the link path
      navigate(currentImage.link_path);
    }
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.25, sm: 0.5 } }}>
      {/* Buttons Section */}
      <NavigationButtons variant="outlined" />

      {/* Carousel loading placeholder */}
      {carouselLoading ? (
        <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 0 }}>
          <Box sx={{
            width: '100%',
            height: { xs: '200px', sm: '350px', md: '500px' },
            borderRadius: { xs: '8px', sm: '12px' },
            backgroundColor: '#e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <CircularProgress sx={{ color: '#FFA500' }} />
          </Box>
        </Container>
      ) : carouselImages.length > 0 && (
        <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 0 }}>
          <Box
            onClick={handleBannerClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            sx={{
              width: '100%',
              height: { xs: '200px', sm: '350px', md: '500px' },
              overflow: 'hidden',
              position: 'relative',
              borderRadius: { xs: '8px', sm: '12px' },
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
                  borderRadius: { xs: '8px', sm: '12px' },
                  filter: isHovered ? 'brightness(0.85)' : 'brightness(1)',
                }}
                onError={(e) => {
                  e.target.src = '/master-image-1.jpg';
                }}
              />
            ))}

            {/* Hover Overlay with Label */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
                padding: { xs: 2, sm: 3, md: 4 },
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.3s ease',
                borderRadius: { xs: '0 0 8px 8px', sm: '0 0 12px 12px' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography
                    variant="h5"
                    sx={{
                      color: 'white',
                      fontWeight: 600,
                      fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' },
                      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                    }}
                  >
                    {carouselImages[currentImageIndex]?.label_en || carouselImages[currentImageIndex]?.event_name}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: { xs: '0.875rem', sm: '1rem', md: '1.125rem' },
                      textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                    }}
                  >
                    {carouselImages[currentImageIndex]?.label_cn || carouselImages[currentImageIndex]?.event_chinese_name}
                  </Typography>
                </Box>
                <ArrowForwardIcon
                  sx={{
                    color: '#FFA500',
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
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
                opacity: isHovered ? 0 : 1,
                transition: 'opacity 0.3s ease',
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
                    backgroundColor: index === currentImageIndex ? '#FFA500' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    transition: 'background-color 0.3s ease, transform 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.2)',
                      backgroundColor: index === currentImageIndex ? '#FFA500' : 'rgba(255,255,255,0.8)',
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
        </Container>
      )}

      {/* Latest Events List - Below Carousel */}
      {carouselImages.length > 0 && (
        <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {carouselImages.map((banner, index) => (
              <Box
                key={banner.id || index}
                onClick={() => {
                  setCurrentImageIndex(index);
                  if (banner.event_id || banner.source_type === 'event_highlight') {
                    setSelectedEvent(banner);
                    setEventModalOpen(true);
                  } else if (banner.link_path) {
                    navigate(banner.link_path);
                  }
                }}
                sx={{
                  py: { xs: 1, sm: 1.5 },
                  px: { xs: 2, sm: 3 },
                  borderRadius: 1,
                  backgroundColor: index === currentImageIndex
                    ? 'rgba(255, 165, 0, 0.2)'
                    : 'rgba(255, 165, 0, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 165, 0, 0.15)',
                  },
                }}
              >
                <Typography
                  sx={{
                    fontWeight: index === currentImageIndex ? 600 : 500,
                    color: '#FFA500',
                    fontSize: { xs: '0.9rem', sm: '1rem' },
                  }}
                >
                  {banner.label_en || banner.event_name} {(banner.label_cn || banner.event_chinese_name) && `/ ${banner.label_cn || banner.event_chinese_name}`}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      )}

      {/* Dynamic Homepage Sections with Drag-and-Drop for Admins */}
      {sectionsLoading ? (
        /* Placeholder boxes while sections load */
        [0, 1, 2].map((i) => (
          <Box key={i} sx={{ mt: { xs: 2, sm: 3 } }}>
            <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mb: { xs: 1, sm: 1.5 } }}>
              <Box sx={{ height: '2rem', width: '40%', mx: 'auto', borderRadius: 1, backgroundColor: '#e0e0e0' }} />
            </Container>
            <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 } }}>
              <Box sx={{
                width: '100%',
                height: { xs: '200px', sm: '350px', md: '500px' },
                borderRadius: { xs: '8px', sm: '12px' },
                backgroundColor: '#e0e0e0',
              }} />
            </Container>
          </Box>
        ))
      ) : adminModeEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                adminModeEnabled={adminModeEnabled}
                onEdit={handleEditSection}
                onPositionEdit={(section) => setSectionPositionEditing(section)}
                upcomingEvents={upcomingEvents}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        sections.map((section) => (
          <SortableSection
            key={section.id}
            section={section}
            adminModeEnabled={false}
            onEdit={() => {}}
            upcomingEvents={upcomingEvents}
          />
        ))
      )}

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
