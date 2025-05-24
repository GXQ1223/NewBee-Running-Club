import SearchIcon from '@mui/icons-material/Search';
import { Box, Button, Container, InputAdornment, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import ClubEntryRules from '../components/ClubEntryRules';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function RecordsPage() {
  const [creditsData, setCreditsData] = useState({
    total: [],
    activity: [],
    registration: [],
    volunteer: []
  });
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all four CSV files
        const files = [
          { name: 'total', path: '/data/total_credits.csv' },
          { name: 'activity', path: '/data/activity_credits.csv' },
          { name: 'registration', path: '/data/registration_credits.csv' },
          { name: 'volunteer', path: '/data/volunteer_credits.csv' }
        ];

        const fetchPromises = files.map(file => 
          fetch(file.path)
            .then(response => response.text())
            .then(csvText => {
              return new Promise((resolve) => {
                Papa.parse(csvText, {
                  header: true,
                  complete: (results) => {
                    const parsedData = results.data
                      .filter(row => row.fullName) // Only keep rows with names
                      .map(row => ({
                        rank: parseInt(row.rank) || 0,
                        fullName: row.fullName,
                        registrationSum: parseFloat(row.registration_sum || 0),
                        checkinSum: parseFloat(row.checkin_sum || 0)
                      }))
                      .sort((a, b) => {
                        // Sort by total points (registration + check-in)
                        const totalA = a.registrationSum + a.checkinSum;
                        const totalB = b.registrationSum + b.checkinSum;
                        if (totalB !== totalA) {
                          return totalB - totalA;
                        }
                        // If totals are equal, sort by name
                        return a.fullName.localeCompare(b.fullName);
                      })
                      .map((row, index) => ({
                        ...row,
                        rank: index + 1 // Assign new ranks based on sorted order
                      }));
                    resolve({ name: file.name, data: parsedData });
                  },
                  error: (error) => {
                    console.error(`Error parsing ${file.name} CSV:`, error);
                    resolve({ name: file.name, data: [] });
                  }
                });
              });
            })
        );

        const results = await Promise.all(fetchPromises);
        const newData = {};
        results.forEach(result => {
          newData[result.name] = result.data;
        });
        
        setCreditsData(newData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching CSV files:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    setShowAll(false);
    setSearchQuery(''); // Clear search when changing tabs
  };

  const getTableHeaders = () => {
    return ['Rank', 'Name', 'Registration Points', 'Check-in Points', 'Total Points'];
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

  const renderTableContent = () => {
    const displayData = getFilteredData();

    return displayData.map((row) => (
      <TableRow key={row.rank} hover>
        <TableCell>{row.rank}</TableCell>
        <TableCell>{row.fullName}</TableCell>
        <TableCell>{row.registrationSum}</TableCell>
        <TableCell>{row.checkinSum}</TableCell>
        <TableCell sx={{ fontWeight: 'bold' }}>
          {(row.registrationSum + row.checkinSum).toFixed(1)}
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Records Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 3
          }}
        >
          Club Credits & Records
          俱乐部积分榜
        </Typography>

        {/* Tabs */}
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            mb: 3,
            '& .MuiTab-root': {
              color: 'text.secondary',
              '&.Mui-selected': {
                color: '#FFA500',
              },
              minWidth: 0,
              flex: 1,
              whiteSpace: 'nowrap',
              fontSize: { xs: '0.75rem', sm: '0.875rem' }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#FFA500',
            },
            maxWidth: '100%',
            width: '100%'
          }}
        >
          <Tab label="Total Credit 总积分" />
          <Tab label="Activity Credit 活动积分" />
          <Tab label="Race Credit 比赛积分" />
          <Tab label="Volunteer Credit 志愿者积分" />
        </Tabs>

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
                variant="outlined"
                placeholder="Search by runner's name 搜索跑者姓名"
                value={searchQuery}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#FFA500' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: '#FFA500',
                    },
                    '&:hover fieldset': {
                      borderColor: '#FFA500',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#FFA500',
                    },
                  },
                }}
              />
            </Box>

            <TableContainer component={Paper} sx={{ mb: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    {getTableHeaders().map((header, index) => (
                      <TableCell
                        key={index}
                        sx={{ fontWeight: 'bold', backgroundColor: '#FFA500', color: 'white' }}
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
            
            {!showAll && creditsData[Object.keys(creditsData)[currentTab]].length > 10 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setShowAll(true)}
                  sx={{
                    color: '#FFA500',
                    borderColor: '#FFA500',
                    '&:hover': {
                      borderColor: '#FFA500',
                      backgroundColor: 'rgba(255, 165, 0, 0.1)',
                    },
                  }}
                >
                  Show All 显示全部
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
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: '#FFA500',
              mb: 3
            }}
          >
            Club Entry Rules
            俱乐部积分规则
          </Typography>
          <ClubEntryRules />
        </Box>
      </Container>
    </Box>
  );
} 