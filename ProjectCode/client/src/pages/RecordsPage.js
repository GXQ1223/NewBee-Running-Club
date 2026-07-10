import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormGroup, IconButton, InputAdornment, InputLabel, LinearProgress, MenuItem, Paper, Radio, RadioGroup, Select, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { getAvailableYears, getMenRecords, getWomenRecords, getSyncRacePatterns, startNyrrSync } from '../api/records';
import { clearApiCache } from '../api/client';
import { getCredits, createCredit, updateCredit, deleteCredit, bulkUploadCredits } from '../api/credits';
import ClubEntryRules from '../components/ClubEntryRules';
import { useAdmin, useAuth } from '../context';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';

export default function RecordsPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { adminModeEnabled } = useAdmin();
  const { currentUser } = useAuth();
  const [creditsData, setCreditsData] = useState({
    total: [],
    activity: [],
    registration: [],
    volunteer: []
  });
  const [recordsData, setRecordsData] = useState([]);
  const [womenRecordsData, setWomenRecordsData] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [currentRecordsTab, setCurrentRecordsTab] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Admin modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create'); // 'create' or 'edit'
  const [dialogTab, setDialogTab] = useState(0); // 0 = single entry, 1 = bulk upload
  const [editingCredit, setEditingCredit] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    credit_type: 'total',
    registration_credits: 0,
    checkin_credits: 0
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [creditToDelete, setCreditToDelete] = useState(null);

  // Bulk upload state
  const [bulkUploadFile, setBulkUploadFile] = useState(null);
  const [bulkUploadType, setBulkUploadType] = useState('activity');
  const [bulkUploadMode, setBulkUploadMode] = useState('merge');
  const [bulkUploadLoading, setBulkUploadLoading] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState(null);

  // NYRR Sync state
  const currentYear = new Date().getFullYear();
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncYears, setSyncYears] = useState([currentYear]);
  const [syncRaceCodes, setSyncRaceCodes] = useState([]);
  const [syncAllRaces, setSyncAllRaces] = useState(true);
  const [availableRacePatterns, setAvailableRacePatterns] = useState([]);
  const [syncProgress, setSyncProgress] = useState([]);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const distances = [
    { label: "1 Mile\n一英里", value: "1M" },
    { label: "5K\n五公里", value: "5K" },
    { label: "4M\n四英里", value: "4M" },
    { label: "5M\n五英里", value: "5M" },
    { label: "10K\n十公里", value: "10K" },
    { label: "10M\n十英里", value: "10M" },
    { label: "12M\n十二英里", value: "12M" },
    { label: "Half Marathon\n半程马拉松", value: "Half Marathon" },
    { label: "Marathon\n全程马拉松", value: "Marathon" }
  ];

  const fetchRecordsData = async (year = null) => {
    try {
      // Fetch men's records data from API
      const menRecordsJson = await getMenRecords(year);

      // Transform API data to match component structure
      const transformedMenRecords = menRecordsJson.men_records?.map((record) => ({
        rank: record.rank,
        fullName: record.runner_name,
        time: record.time,
        race: record.race_name,
        distance: record.distance,
        ageGroup: record.age_group,
        pace: record.pace,
        raceDate: record.race_date
      })) || [];

      setRecordsData(transformedMenRecords);

      // Fetch women's records data from API
      const womenRecordsJson = await getWomenRecords(year);

      // Transform API data to match component structure
      const transformedWomenRecords = womenRecordsJson.women_records?.map((record) => ({
        rank: record.rank,
        fullName: record.runner_name,
        time: record.time,
        race: record.race_name,
        distance: record.distance,
        ageGroup: record.age_group,
        pace: record.pace,
        raceDate: record.race_date
      })) || [];

      setWomenRecordsData(transformedWomenRecords);
    } catch (error) {
      console.error('Error fetching records data:', error);
      setRecordsData([]);
      setWomenRecordsData([]);
    }
  };

  const handleYearChange = async (year) => {
    setSelectedYear(year);
    await fetchRecordsData(year || null);
  };

  // Credit type mapping for tabs
  const creditTypes = ['total', 'activity', 'registration', 'volunteer'];

  const fetchCreditsData = async () => {
    try {
      const creditTypeNames = ['total', 'activity', 'registration', 'volunteer'];
      const newData = {};

      for (const creditType of creditTypeNames) {
        const credits = await getCredits(creditType);
        // Transform API response to component format
        const transformedData = credits
          .map((credit, index) => ({
            id: credit.id,
            rank: index + 1,
            fullName: credit.full_name,
            registrationSum: parseFloat(credit.registration_credits || 0),
            checkinSum: parseFloat(credit.checkin_credits || 0)
          }));
        newData[creditType] = transformedData;
      }

      setCreditsData(newData);
    } catch (error) {
      console.error('Error fetching credits from API:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch available years
        const yearsJson = await getAvailableYears();
        setAvailableYears(yearsJson.years || []);

        // Fetch records data (initially without year filter)
        await fetchRecordsData();

        // Fetch credits data from API
        await fetchCreditsData();

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Admin CRUD handlers
  const handleOpenDialog = (mode, credit = null) => {
    setDialogMode(mode);
    setDialogTab(0); // Reset to single entry tab
    setBulkUploadResult(null); // Clear previous upload result
    if (mode === 'edit' && credit) {
      setEditingCredit(credit);
      setFormData({
        full_name: credit.fullName,
        credit_type: creditTypes[currentTab],
        registration_credits: credit.registrationSum,
        checkin_credits: credit.checkinSum
      });
    } else {
      setEditingCredit(null);
      setFormData({
        full_name: '',
        credit_type: creditTypes[currentTab],
        registration_credits: 0,
        checkin_credits: 0
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCredit(null);
    setDialogTab(0);
    setFormData({
      full_name: '',
      credit_type: 'total',
      registration_credits: 0,
      checkin_credits: 0
    });
    // Reset bulk upload state
    setBulkUploadFile(null);
    setBulkUploadType('activity');
    setBulkUploadMode('merge');
    setBulkUploadLoading(false);
    setBulkUploadResult(null);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      if (dialogMode === 'create') {
        await createCredit(formData, currentUser?.uid);
      } else {
        await updateCredit(editingCredit.id, formData, currentUser?.uid);
      }
      handleCloseDialog();
      await fetchCreditsData();
    } catch (error) {
      console.error('Error saving credit:', error);
      alert(`Error: ${error.message || 'Failed to save credit'}`);
    }
  };

  const handleDeleteClick = (credit) => {
    setCreditToDelete(credit);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteCredit(creditToDelete.id, currentUser?.uid);
      setDeleteConfirmOpen(false);
      setCreditToDelete(null);
      await fetchCreditsData();
    } catch (error) {
      console.error('Error deleting credit:', error);
      alert(`Error: ${error.message || 'Failed to delete credit'}`);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) {
      alert('Please select a CSV file');
      return;
    }

    setBulkUploadLoading(true);
    setBulkUploadResult(null);

    try {
      const result = await bulkUploadCredits(
        bulkUploadFile,
        bulkUploadType,
        bulkUploadMode,
        currentUser?.uid
      );
      setBulkUploadResult(result);
      // Refresh credits data after successful upload
      await fetchCreditsData();
    } catch (error) {
      console.error('Bulk upload error:', error);
      setBulkUploadResult({
        error: true,
        message: error.message || 'Failed to upload credits'
      });
    } finally {
      setBulkUploadLoading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setBulkUploadFile(file);
    } else if (file) {
      alert('Please select a CSV file');
      event.target.value = '';
    }
  };

  // NYRR Sync handlers
  const handleOpenSyncDialog = async () => {
    setSyncDialogOpen(true);
    setSyncProgress([]);
    setSyncResult(null);
    setSyncYears([currentYear]);
    setSyncAllRaces(true);
    setSyncRaceCodes([]);
    try {
      const data = await getSyncRacePatterns();
      setAvailableRacePatterns(data.races || []);
    } catch (error) {
      console.error('Error fetching race patterns:', error);
    }
  };

  const handleCloseSyncDialog = () => {
    if (!syncRunning) {
      setSyncDialogOpen(false);
    }
  };

  const toggleSyncYear = (year) => {
    setSyncYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort()
    );
  };

  const toggleSyncRaceCode = (code) => {
    setSyncRaceCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleStartSync = async () => {
    if (syncYears.length === 0) return;
    setSyncRunning(true);
    setSyncProgress([]);
    setSyncResult(null);

    try {
      await startNyrrSync(
        {
          years: syncYears,
          race_codes: syncAllRaces ? null : syncRaceCodes,
        },
        currentUser?.uid,
        (event) => {
          if (event.type === 'progress') {
            setSyncProgress(prev => {
              const updated = [...prev];
              updated[event.index] = event;
              return updated;
            });
          } else if (event.type === 'complete') {
            setSyncResult(event);
          }
        }
      );
    } catch (error) {
      setSyncResult({ total_imported: 0, total_errors: 1, error: error.message });
    } finally {
      setSyncRunning(false);
      // Refresh records data
      clearApiCache('/api/results');
      await fetchRecordsData(selectedYear || null);
      const yearsJson = await getAvailableYears();
      setAvailableYears(yearsJson.years || []);
    }
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    setShowAll(false);
  };

  const handleRecordsTabChange = (event, newValue) => {
    setCurrentRecordsTab(newValue);
  };

  const getTableHeaders = () => {
    const headers = ['Rank', 'Name', 'Registration Points', 'Check-in', 'Total Points'];
    if (adminModeEnabled) {
      headers.push('Actions');
    }
    return headers;
  };

  const getRecordsTableHeaders = () => {
    return ['Rank', 'Name', 'Time', 'Race'];
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const getFilteredData = () => {
    const data = creditsData[Object.keys(creditsData)[currentTab]] || [];
    if (!searchQuery) {
      return showAll ? data : data.slice(0, 10);
    }
    const filtered = data.filter(row => 
      row.fullName && row.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return showAll ? filtered : filtered.slice(0, 10);
  };

  const getFilteredRecordsData = () => {
    const currentDistance = distances[currentRecordsTab].value;
    return recordsData
      .filter(row => row.distance === currentDistance)
      .sort((a, b) => a.rank - b.rank);
  };

  const getFilteredWomenRecordsData = () => {
    const currentDistance = distances[currentRecordsTab].value;
    return womenRecordsData
      .filter(row => row.distance === currentDistance)
      .sort((a, b) => a.rank - b.rank);
  };

  const renderTableContent = () => {
    const displayData = getFilteredData();

    return displayData.map((row) => (
      <TableRow key={row.id || row.rank} hover>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.rank}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.fullName}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.registrationSum}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.checkinSum}</TableCell>
        <TableCell sx={{ fontWeight: 'bold', fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>
          {(row.registrationSum + row.checkinSum).toFixed(1)}
        </TableCell>
        {adminModeEnabled && (
          <TableCell sx={{ px: { xs: 0.5, sm: 1 } }}>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog('edit', row)}
              sx={{ color: '#FFA500' }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleDeleteClick(row)}
              sx={{ color: '#ff4444' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </TableCell>
        )}
      </TableRow>
    ));
  };

  const renderRecordsTableContent = () => {
    const displayData = getFilteredRecordsData();

    return displayData.map((row) => (
      <TableRow key={row.rank} hover>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.rank}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.fullName}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.time}</TableCell>
        <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.race}</TableCell>
      </TableRow>
    ));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.25, sm: 0.5 } }}>
      {/* Navigation Buttons */}

      {/* Admin Mode Info */}
      {adminModeEnabled && (
        <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
          <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Admin Information:</strong> Club credits are stored in the database. Use the edit/delete buttons to modify entries, or "Add Credit" to create new ones. Race records are automatically imported from NYRR via the <code>fetch_historical_data.py</code> script.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>管理员信息：</strong> 俱乐部积分存储在数据库中。使用编辑/删除按钮修改条目，或点击"添加积分"创建新条目。比赛记录通过 <code>fetch_historical_data.py</code> 脚本从NYRR自动导入。
            </Typography>
          </Alert>
        </Container>
      )}

      {/* Records Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: { xs: 2, sm: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 2 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            NYRR Club Records
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            NYRR俱乐部记录
          </Typography>
        </Box>

        {/* Year Filter */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3
        }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel
              sx={{
                '&.Mui-focused': { color: ORANGE }
              }}
            >
              Select Year 选择年份
            </InputLabel>
            <Select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              label="Select Year 选择年份"
              sx={{
                borderRadius: '10px',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: LINE,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: ORANGE,
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: ORANGE,
                },
              }}
            >
              <MenuItem value="">
                All Years 所有年份
              </MenuItem>
              {availableYears.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {adminModeEnabled && (
            <Button
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={handleOpenSyncDialog}
              sx={{
                backgroundColor: ORANGE,
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                px: 2.5,
                boxShadow: 'none',
                '&:hover': { backgroundColor: ORANGE_DARK, boxShadow: 'none' },
              }}
            >
              Sync NYRR Data
            </Button>
          )}
        </Box>

        {/* Records Tabs */}
        <Tabs
          value={currentRecordsTab}
          onChange={handleRecordsTabChange}
          variant={isDesktop ? "fullWidth" : "scrollable"}
          scrollButtons={isDesktop ? false : "auto"}
          allowScrollButtonsMobile={!isDesktop}
          sx={{
            mb: 3,
            '& .MuiTab-root': {
              color: 'text.secondary',
              '&.Mui-selected': {
                color: '#FFA500',
              },
              minWidth: isDesktop ? 'auto' : { xs: 60, sm: 80 },
              px: { xs: 1, sm: 2 },
              py: { xs: 1, sm: 1.5 },
              fontSize: { xs: '0.65rem', sm: '0.875rem' }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#FFA500',
            },
            '& .MuiTabs-scrollButtons': {
              '&.Mui-disabled': { opacity: 0.3 },
            },
          }}
        >
          {distances.map((distance, index) => (
            <Tab
              key={index}
              label={
                <Box sx={{
                  whiteSpace: 'pre-line',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  fontSize: { xs: '0.6rem', sm: '0.875rem' }
                }}>
                  {distance.label}
                </Box>
              }
            />
          ))}
        </Tabs>

        {/* Records Table */}
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 4
        }}>
          {/* Men's Records Table */}
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              flex: 1,
              borderRadius: '12px',
              border: `1px solid ${LINE}`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden'
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                color: INK,
                p: { xs: 1.5, sm: 2 },
                borderBottom: `2px solid ${ORANGE}`,
                fontSize: '1.05rem'
              }}
            >
              Men's Records
              <Box component="span" sx={{ ml: 1, fontWeight: 400, fontSize: '0.875rem', color: MUTED }}>
                男子记录
              </Box>
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {getRecordsTableHeaders().map((header, index) => (
                    <TableCell
                      key={index}
                      sx={{
                        fontWeight: 700,
                        backgroundColor: ORANGE_BG,
                        color: INK,
                        borderBottom: `1px solid ${LINE}`,
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        px: { xs: 1, sm: 2 },
                        py: { xs: 0.75, sm: 1 }
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {renderRecordsTableContent()}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Women's Records Table */}
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              flex: 1,
              borderRadius: '12px',
              border: `1px solid ${LINE}`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden'
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                color: INK,
                p: { xs: 1.5, sm: 2 },
                borderBottom: `2px solid ${ORANGE}`,
                fontSize: '1.05rem'
              }}
            >
              Women's Records
              <Box component="span" sx={{ ml: 1, fontWeight: 400, fontSize: '0.875rem', color: MUTED }}>
                女子记录
              </Box>
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {getRecordsTableHeaders().map((header, index) => (
                    <TableCell
                      key={index}
                      sx={{
                        fontWeight: 700,
                        backgroundColor: ORANGE_BG,
                        color: INK,
                        borderBottom: `1px solid ${LINE}`,
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        px: { xs: 1, sm: 2 },
                        py: { xs: 0.75, sm: 1 }
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {getFilteredWomenRecordsData().map((row) => (
                  <TableRow key={row.rank} hover>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.rank}</TableCell>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.fullName}</TableCell>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.time}</TableCell>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, px: { xs: 1, sm: 2 } }}>{row.race}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 2 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Current Year Club Credit
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            本年度俱乐部积分
          </Typography>
        </Box>

        {/* Credits Tabs */}
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant={isDesktop ? "fullWidth" : "scrollable"}
          scrollButtons={isDesktop ? false : "auto"}
          allowScrollButtonsMobile={!isDesktop}
          sx={{
            mb: 3,
            '& .MuiTab-root': {
              color: 'text.secondary',
              '&.Mui-selected': {
                color: '#FFA500',
              },
              minWidth: isDesktop ? 'auto' : { xs: 'auto', sm: 120 },
              px: { xs: 1.5, sm: 2 },
              fontSize: { xs: '0.7rem', sm: '0.875rem' }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#FFA500',
            },
            '& .MuiTabs-scrollButtons': {
              '&.Mui-disabled': { opacity: 0.3 },
            },
          }}
        >
          <Tab label={<Box sx={{ textAlign: 'center' }}>Total Credit<br/>总积分</Box>} />
          <Tab label={<Box sx={{ textAlign: 'center' }}>Activity Credit<br/>活动积分</Box>} />
          <Tab label={<Box sx={{ textAlign: 'center' }}>Race Credit<br/>比赛积分</Box>} />
          <Tab label={<Box sx={{ textAlign: 'center' }}>Volunteer Credit<br/>志愿者积分</Box>} />
        </Tabs>

        {/* Admin Add Credit Button */}
        {adminModeEnabled && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog('create')}
              sx={{
                backgroundColor: ORANGE,
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                px: 2.5,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: ORANGE_DARK,
                  boxShadow: 'none',
                },
              }}
            >
              Add Credit 添加积分
            </Button>
          </Box>
        )}

        {loading ? (
          <Typography variant="body1" color="text.secondary">
            Loading data...
          </Typography>
        ) : creditsData[Object.keys(creditsData)[currentTab]]?.length > 0 ? (
          <>
            {/* Search Bar */}
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                placeholder="Search by runner's name 搜索跑者姓名"
                value={searchQuery}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: ORANGE }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '99px',
                    '& fieldset': {
                      borderColor: LINE,
                    },
                    '&:hover fieldset': {
                      borderColor: ORANGE,
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: ORANGE,
                    },
                  },
                }}
              />
            </Box>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                mb: 2,
                borderRadius: '12px',
                border: `1px solid ${LINE}`,
                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                overflow: 'hidden'
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {getTableHeaders().map((header, index) => (
                      <TableCell
                        key={index}
                        sx={{
                          fontWeight: 700,
                          backgroundColor: ORANGE_BG,
                          color: INK,
                          borderBottom: `1px solid ${LINE}`,
                          fontSize: { xs: '0.75rem', sm: '0.875rem' },
                          px: { xs: 1, sm: 2 },
                          py: { xs: 0.75, sm: 1 }
                        }}
                      >
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderTableContent()}
                </TableBody>
              </Table>
            </TableContainer>
            
            {creditsData[Object.keys(creditsData)[currentTab]].length > 10 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setShowAll(!showAll)}
                  sx={{
                    color: ORANGE,
                    border: `1.5px solid ${ORANGE}`,
                    borderRadius: '99px',
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 3,
                    '&:hover': {
                      border: `1.5px solid ${ORANGE}`,
                      backgroundColor: ORANGE,
                      color: 'white',
                    },
                  }}
                >
                  {showAll ? 'Show Less 显示较少' : 'Show All 显示全部'}
                </Button>
              </Box>
            )}
          </>
        ) : (
          <Typography variant="body1" color="text.secondary">
            No data available
          </Typography>
        )}

        {/* Club Entry Rules Section */}
        <Box sx={{ mt: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 2 }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
              Club Entry Rules
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
              俱乐部积分规则
            </Typography>
          </Box>
          <ClubEntryRules />
        </Box>
      </Container>

      {/* Create/Edit Credit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? 'Add Credits 添加积分' : 'Edit Credit 编辑积分'}
        </DialogTitle>
        <DialogContent>
          {/* Show tabs only in create mode */}
          {dialogMode === 'create' && (
            <Tabs
              value={dialogTab}
              onChange={(e, newValue) => {
                setDialogTab(newValue);
                setBulkUploadResult(null);
              }}
              sx={{
                mb: 2,
                '& .MuiTab-root': {
                  '&.Mui-selected': { color: '#FFA500' },
                },
                '& .MuiTabs-indicator': { backgroundColor: '#FFA500' },
              }}
            >
              <Tab label="Single Entry 单条录入" />
              <Tab label="Bulk Upload 批量上传" icon={<UploadFileIcon />} iconPosition="start" />
            </Tabs>
          )}

          {/* Single Entry Form */}
          {(dialogMode === 'edit' || dialogTab === 0) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Full Name 姓名"
                value={formData.full_name}
                onChange={(e) => handleFormChange('full_name', e.target.value)}
                fullWidth
                required
              />
              <FormControl fullWidth>
                <InputLabel>Credit Type 积分类型</InputLabel>
                <Select
                  value={formData.credit_type}
                  onChange={(e) => handleFormChange('credit_type', e.target.value)}
                  label="Credit Type 积分类型"
                >
                  <MenuItem value="total">Total 总积分</MenuItem>
                  <MenuItem value="activity">Activity 活动积分</MenuItem>
                  <MenuItem value="registration">Registration 比赛积分</MenuItem>
                  <MenuItem value="volunteer">Volunteer 志愿者积分</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Registration Points 报名积分"
                type="number"
                value={formData.registration_credits}
                onChange={(e) => handleFormChange('registration_credits', parseFloat(e.target.value) || 0)}
                fullWidth
                inputProps={{ step: 0.5 }}
              />
              <TextField
                label="Check-in Points 签到积分"
                type="number"
                value={formData.checkin_credits}
                onChange={(e) => handleFormChange('checkin_credits', parseFloat(e.target.value) || 0)}
                fullWidth
                inputProps={{ step: 0.5 }}
              />
            </Box>
          )}

          {/* Bulk Upload Form */}
          {dialogMode === 'create' && dialogTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Alert severity="info" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>CSV Format:</strong> fullName, registration_sum, checkin_sum
                </Typography>
                <Typography variant="body2">
                  <strong>CSV格式：</strong> fullName, registration_sum, checkin_sum
                </Typography>
              </Alert>

              <FormControl fullWidth>
                <InputLabel>Credit Type 积分类型</InputLabel>
                <Select
                  value={bulkUploadType}
                  onChange={(e) => setBulkUploadType(e.target.value)}
                  label="Credit Type 积分类型"
                >
                  <MenuItem value="total">Total 总积分</MenuItem>
                  <MenuItem value="activity">Activity 活动积分</MenuItem>
                  <MenuItem value="registration">Registration 比赛积分</MenuItem>
                  <MenuItem value="volunteer">Volunteer 志愿者积分</MenuItem>
                </Select>
              </FormControl>

              <FormControl component="fieldset">
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                  Upload Mode 上传模式
                </Typography>
                <RadioGroup
                  value={bulkUploadMode}
                  onChange={(e) => setBulkUploadMode(e.target.value)}
                >
                  <FormControlLabel
                    value="merge"
                    control={<Radio sx={{ '&.Mui-checked': { color: '#FFA500' } }} />}
                    label="Merge (update existing, add new) 合并（更新已有，添加新条目）"
                  />
                  <FormControlLabel
                    value="replace"
                    control={<Radio sx={{ '&.Mui-checked': { color: '#FFA500' } }} />}
                    label="Replace All (delete existing first) 全部替换（先删除已有）"
                  />
                </RadioGroup>
              </FormControl>

              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFileIcon />}
                sx={{
                  borderColor: '#FFA500',
                  color: '#FFA500',
                  '&:hover': { borderColor: '#e69500', backgroundColor: 'rgba(255, 165, 0, 0.1)' },
                }}
              >
                {bulkUploadFile ? bulkUploadFile.name : 'Select CSV File 选择CSV文件'}
                <input
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>

              {/* Upload Result */}
              {bulkUploadResult && (
                <Alert severity={bulkUploadResult.error ? 'error' : 'success'} sx={{ mt: 1 }}>
                  {bulkUploadResult.error ? (
                    <Typography variant="body2">{bulkUploadResult.message}</Typography>
                  ) : (
                    <>
                      <Typography variant="body2">
                        <strong>Upload Complete!</strong> 上传完成！
                      </Typography>
                      <Typography variant="body2">
                        Rows processed: {bulkUploadResult.rows_processed} |
                        Added: {bulkUploadResult.rows_added} |
                        Updated: {bulkUploadResult.rows_updated}
                      </Typography>
                      <Typography variant="body2">
                        Totals recalculated: {bulkUploadResult.totals_recalculated}
                      </Typography>
                      {bulkUploadResult.total_errors > 0 && (
                        <Typography variant="body2" color="error">
                          Errors: {bulkUploadResult.total_errors}
                          {bulkUploadResult.errors?.length > 0 && (
                            <span> - {bulkUploadResult.errors.join('; ')}</span>
                          )}
                        </Typography>
                      )}
                    </>
                  )}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel 取消</Button>
          {(dialogMode === 'edit' || dialogTab === 0) && (
            <Button
              onClick={handleSubmit}
              variant="contained"
              sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#e69500' } }}
            >
              {dialogMode === 'create' ? 'Create 创建' : 'Save 保存'}
            </Button>
          )}
          {dialogMode === 'create' && dialogTab === 1 && (
            <Button
              onClick={handleBulkUpload}
              variant="contained"
              disabled={!bulkUploadFile || bulkUploadLoading}
              startIcon={bulkUploadLoading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
              sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#e69500' } }}
            >
              {bulkUploadLoading ? 'Uploading...' : 'Upload 上传'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete 确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the credit entry for "{creditToDelete?.fullName}"?
          </Typography>
          <Typography sx={{ mt: 1 }}>
            确定要删除 "{creditToDelete?.fullName}" 的积分记录吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel 取消</Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
          >
            Delete 删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* NYRR Sync Dialog */}
      <Dialog open={syncDialogOpen} onClose={handleCloseSyncDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Sync NYRR Race Data 同步NYRR比赛数据</DialogTitle>
        <DialogContent>
          {/* Year Selection */}
          <Typography variant="subtitle2" sx={{ mb: 1, mt: 1 }}>
            Select Years 选择年份
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i).map(year => (
              <Chip
                key={year}
                label={year}
                clickable
                color={syncYears.includes(year) ? 'primary' : 'default'}
                variant={syncYears.includes(year) ? 'filled' : 'outlined'}
                onClick={() => toggleSyncYear(year)}
                disabled={syncRunning}
                sx={syncYears.includes(year) ? {
                  backgroundColor: '#FFA500',
                  '&:hover': { backgroundColor: '#e69500' },
                } : {}}
              />
            ))}
          </Box>

          {/* Race Selection */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Select Races 选择比赛
          </Typography>
          <Box sx={{ mb: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={syncAllRaces}
                  onChange={(e) => setSyncAllRaces(e.target.checked)}
                  disabled={syncRunning}
                  sx={{ '&.Mui-checked': { color: '#FFA500' } }}
                />
              }
              label="All Races 所有比赛"
            />
          </Box>
          {!syncAllRaces && (
            <FormGroup sx={{ maxHeight: 200, overflowY: 'auto', ml: 1, mb: 2 }}>
              {availableRacePatterns.map(race => (
                <FormControlLabel
                  key={race.code}
                  control={
                    <Checkbox
                      checked={syncRaceCodes.includes(race.code)}
                      onChange={() => toggleSyncRaceCode(race.code)}
                      disabled={syncRunning}
                      size="small"
                      sx={{ '&.Mui-checked': { color: '#FFA500' } }}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {race.name_template.replace('{year}', '')} ({race.distance})
                    </Typography>
                  }
                />
              ))}
            </FormGroup>
          )}

          {/* Progress Area */}
          {(syncRunning || syncProgress.length > 0) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Progress 进度
              </Typography>
              {syncRunning && <LinearProgress sx={{ mb: 1, '& .MuiLinearProgress-bar': { backgroundColor: '#FFA500' } }} />}
              <Box sx={{ maxHeight: 250, overflowY: 'auto' }}>
                {syncProgress.map((item, idx) => item && (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    {item.status === 'fetching' && <CircularProgress size={16} sx={{ color: '#FFA500' }} />}
                    {item.status === 'imported' && <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />}
                    {item.status === 'no_data' && <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
                    {item.status === 'error' && <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {item.race}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.status === 'imported' && `${item.count} records`}
                      {item.status === 'no_data' && 'No data'}
                      {item.status === 'error' && 'Error'}
                      {item.status === 'fetching' && 'Fetching...'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Sync Result */}
          {syncResult && (
            <Alert severity={syncResult.error ? 'error' : 'success'} sx={{ mt: 2 }}>
              {syncResult.error ? (
                <Typography variant="body2">{syncResult.error}</Typography>
              ) : (
                <Typography variant="body2">
                  Sync complete! Imported {syncResult.total_imported} records.
                  {syncResult.total_errors > 0 && ` Errors: ${syncResult.total_errors}`}
                </Typography>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSyncDialog} disabled={syncRunning}>
            Close 关闭
          </Button>
          <Button
            onClick={handleStartSync}
            variant="contained"
            disabled={syncRunning || syncYears.length === 0 || (!syncAllRaces && syncRaceCodes.length === 0)}
            startIcon={syncRunning ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
            sx={{ backgroundColor: '#FFA500', '&:hover': { backgroundColor: '#e69500' } }}
          >
            {syncRunning ? 'Syncing...' : 'Start Sync 开始同步'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 