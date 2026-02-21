// src/App.js
import React, { Suspense } from "react";
import { Box, CircularProgress, Container, CssBaseline, ThemeProvider, Typography } from "@mui/material";
import { amber, indigo } from "@mui/material/colors";
import { createTheme } from "@mui/material/styles";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import NavBar from "./components/NavBar";
import { AuthProvider, AdminProvider, SocialLinksProvider } from "./context";
import HomePage from "./pages/HomePage";

// Lazy-loaded pages — only downloaded when the user navigates to them
const AboutPage = React.lazy(() => import("./pages/AboutPage"));
const AdminPanelPage = React.lazy(() => import("./pages/AdminPanelPage"));
const CalendarPage = React.lazy(() => import("./pages/CalendarPage"));
const GalleryPage = React.lazy(() => import("./pages/GalleryPage"));
const HighlightsPage = React.lazy(() => import("./pages/HighlightsPage"));
const JoinPage = React.lazy(() => import("./pages/JoinPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const ProfilePage = React.lazy(() => import("./pages/ProfilePage"));
const RecordsPage = React.lazy(() => import("./pages/RecordsPage"));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));
const SponsorsPage = React.lazy(() => import("./pages/SponsorsPage"));
const TrainingPage = React.lazy(() => import("./pages/TrainingPage"));

// Create the theme
export const theme = createTheme({
  palette: {
    primary: indigo,
    secondary: amber,
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AdminProvider>
          <SocialLinksProvider>
          <BrowserRouter>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
            }}
          >
            {/* Header/NavBar */}
            <NavBar />

            {/* Main content area */}
            <Box
              component="main"
              sx={{
                flex: '1 0 auto',
                mb: 4,
              }}
            >
              <Suspense fallback={
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
                  <CircularProgress sx={{ color: '#FFA500' }} />
                </Box>
              }>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/highlights" element={<HighlightsPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/training" element={<TrainingPage />} />
                  <Route path="/training/ai" element={<TrainingPage />} />
                  <Route path="/training/community" element={<TrainingPage />} />
                  <Route path="/training/routes" element={<TrainingPage />} />
                  <Route path="/records" element={<RecordsPage />} />
                  <Route path="/join" element={<JoinPage />} />
                  <Route path="/sponsors" element={<SponsorsPage />} />
                  {/* Auth Routes */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminPanelPage />} />
                  {/* Gallery Route */}
                  <Route path="/events/:eventId/gallery" element={<GalleryPage />} />
                </Routes>
              </Suspense>
            </Box>

            {/* Footer */}
            <Box
              component="footer"
              sx={{
                py: 8,
                mt: 'auto',
                minHeight: '300px',
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '150px',
                  background: 'linear-gradient(to top, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)',
                  zIndex: 1,
                },
                backgroundImage: 'url(/Footer.png)',
                backgroundSize: '100% auto',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'no-repeat',
                display: 'flex',
                alignItems: 'flex-end'
              }}
            >
              <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 2, px: 2, pb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Typography
                    variant="caption"
                    align="center"
                    sx={{ 
                      display: 'block', 
                      fontSize: '0.75rem', 
                      color: 'white',
                      fontWeight: 500,
                      position: 'absolute',
                      bottom: '-30px'
                    }}
                  >
                    Copyright © {new Date().getFullYear()} NewBee Running Club. All rights reserved.
                  </Typography>
                </Box>
              </Container>
            </Box>
          </Box>
          </BrowserRouter>
          </SocialLinksProvider>
        </AdminProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}