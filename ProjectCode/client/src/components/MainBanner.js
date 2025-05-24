import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export default function MainBanner() {
  const [currentImage, setCurrentImage] = useState(0);
  
  // This will be populated with actual images from the banner-images folder
  const bannerImages = [
    '/banner-images/banner1.jpg',
    '/banner-images/banner2.jpg',
    '/banner-images/banner3.jpg',
    // Add more images as needed
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % bannerImages.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(timer);
  }, []);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '400px', // Adjust height as needed
        overflow: 'hidden',
      }}
    >
      {/* Background Image */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${bannerImages[currentImage]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'opacity 1s ease-in-out',
        }}
      />

      {/* Overlay */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)', // Semi-transparent overlay
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Text Overlay */}
        <Typography
          variant="h2"
          sx={{
            color: 'white',
            textAlign: 'center',
            fontWeight: 700,
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
            fontFamily: 'Orbitron, monospace',
          }}
        >
          NewBee Running Club
        </Typography>
      </Box>
    </Box>
  );
} 