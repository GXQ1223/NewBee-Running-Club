import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import DonorGrid from '../components/DonorGrid';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function SponsorsPage() {
  const [individualDonors, setIndividualDonors] = useState([]);
  const [enterpriseDonors, setEnterpriseDonors] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  useEffect(() => {
    // Fetch donor data
    const fetchData = async () => {
      try {
        console.log('Starting to fetch donor data...');
        
        const [individualResponse, enterpriseResponse] = await Promise.all([
          fetch('/data/individualDonors.csv'),
          fetch('/data/enterpriseDonors.csv')
        ]);

        console.log('Fetch responses:', {
          individual: individualResponse.status,
          enterprise: enterpriseResponse.status
        });

        if (!individualResponse.ok || !enterpriseResponse.ok) {
          throw new Error(`Failed to fetch donor data: ${individualResponse.status} ${enterpriseResponse.status}`);
        }

        const [individualText, enterpriseText] = await Promise.all([
          individualResponse.text(),
          enterpriseResponse.text()
        ]);

        console.log('CSV text received:', {
          individualLength: individualText.length,
          enterpriseLength: enterpriseText.length
        });

        // Parse CSV data
        const individualParsed = Papa.parse(individualText, { 
          header: true,
          skipEmptyLines: true
        });

        const enterpriseParsed = Papa.parse(enterpriseText, { 
          header: true,
          skipEmptyLines: true
        });

        console.log('Parsed CSV data:', {
          individualRows: individualParsed.data.length,
          enterpriseRows: enterpriseParsed.data.length
        });

        // Process individual donors
        const individualData = individualParsed.data
          .filter(donor => donor.name && donor.amount) // Filter out empty rows
          .map((donor, index) => ({
            id: index,
            name: donor.name,
            organization: donor.organization || '',
            calling: donor.calling || '',
            amount: Number(donor.amount),
            donateTime: new Date(donor.donateTime)
          }));

        // Process enterprise donors
        const enterpriseData = enterpriseParsed.data
          .filter(donor => donor.name && donor.amount) // Filter out empty rows
          .map((donor, index) => ({
            id: index,
            name: donor.name,
            amount: Number(donor.amount),
            donateTime: new Date(donor.donateTime)
          }));

        console.log('Processed data:', {
          individualDonors: individualData.length,
          enterpriseDonors: enterpriseData.length,
          sampleIndividual: individualData[0],
          sampleEnterprise: enterpriseData[0]
        });

        setIndividualDonors(individualData);
        setEnterpriseDonors(enterpriseData);
      } catch (error) {
        console.error('Error in fetchData:', error);
      }
    };

    fetchData();
  }, []);

  const individualColumns = [
    { field: 'name', headerName: 'Name', width: 200 },
    { field: 'organization', headerName: 'Organization', width: 200 },
    { field: 'calling', headerName: 'Title', width: 100 }
  ];

  const enterpriseColumns = [
    { field: 'name', headerName: 'Organization', width: 300 }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Logo Section */}
      <Logo />
      
      {/* Navigation Buttons */}
      <PageButtons />
      
      {/* Sponsors Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: '#FFA500',
              mb: 3
            }}
          >
            Our Sponsors/Donors
            我们的捐助者/赞助商
          </Typography>
        </Box>
      </Container>

      {/* Sponsors Content */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 0, mb: 0 }}>
        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: '12px',
          p: { xs: 3, md: 6 },
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        }}>
          <Typography
            variant="body1"
            sx={{
              fontFamily: 'Roboto, sans-serif',
              fontSize: '16px',
              lineHeight: 1.6,
              color: '#333',
              mb: 3,
            }}
          >
            新蜂已正式注册为 501(c)(3) 非营利组织，将以更专业的方式服务跑者。欢迎通过 Zelle：newbeerunningclub@gmail.com 支持跑团运作。所有款项将用于活动物资、义工补给等方面。感谢每一位支持新蜂的你 ✨
            以下排名不分先后，不论多少，每一笔捐款我们都非常感谢。谢谢大家的支持！
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontFamily: 'Roboto, sans-serif',
              fontSize: '16px',
              lineHeight: 1.6,
              color: '#333',
              mb: 3,
            }}
          >
            NewBee has officially registered as a 501(c)(3) non-profit organization, serving runners in a more professional manner. Support our running club via Zelle: newbeerunningclub@gmail.com. All funds will be used for event supplies and volunteer support. Thank you for supporting NewBee ✨
            Below is the list of our sponsors/donors. Thank you for your support!
          </Typography>
        </Box>
      </Container>

      {/* Donors Tabs Section */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Box sx={{ 
          borderBottom: 1, 
          borderColor: 'divider',
          '& .MuiTabs-root': {
            minHeight: 'unset',
          },
          '& .MuiTab-root': {
            minHeight: 'unset',
            padding: '12px 0',
            width: '50%',
            fontSize: '2.125rem', // Same as h4
            fontWeight: 600,
            color: 'rgba(102, 102, 102, 0.25)', // Much more transparent gray
            '&.Mui-selected': {
              color: '#FFA500', // Same as main title
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: '#FFA500', // Same as main title
            height: '3px',
          },
        }}>
          <Tabs 
            value={selectedTab} 
            onChange={handleTabChange}
            variant="fullWidth"
          >
            <Tab 
              label={
                <Typography sx={{ 
                  fontSize: 'inherit', 
                  fontWeight: 'inherit',
                  textAlign: 'center',
                  whiteSpace: 'pre-line'
                }}>
                  {`Individual Donors\n个人赞助者`}
                </Typography>
              }
            />
            <Tab 
              label={
                <Typography sx={{ 
                  fontSize: 'inherit', 
                  fontWeight: 'inherit',
                  textAlign: 'center',
                  whiteSpace: 'pre-line'
                }}>
                  {`Enterprise Donors\n企业赞助者`}
                </Typography>
              }
            />
          </Tabs>
        </Box>

        {/* Individual Donors Tab Panel */}
        <Box sx={{ display: selectedTab === 0 ? 'block' : 'none', mt: 3 }}>
          <DonorGrid
            data={individualDonors}
            columns={individualColumns}
          />
        </Box>

        {/* Enterprise Donors Tab Panel */}
        <Box sx={{ display: selectedTab === 1 ? 'block' : 'none', mt: 3 }}>
          <DonorGrid
            data={enterpriseDonors}
            columns={enterpriseColumns}
          />
        </Box>
      </Container>
    </Box>
  );
} 