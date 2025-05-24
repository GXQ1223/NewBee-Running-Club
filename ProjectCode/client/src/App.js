// src/App.js
import { Box, Container, CssBaseline, ThemeProvider, Typography } from "@mui/material";
import { amber, indigo } from "@mui/material/colors";
import { createTheme } from "@mui/material/styles";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import NavBar from "./components/NavBar";
import { AuthProvider } from "./context";
import AboutPage from "./pages/AboutPage";
import CalendarPage from "./pages/CalendarPage";
import HighlightsPage from "./pages/HighlightsPage";
import HomePage from "./pages/HomePage";
import JoinPage from "./pages/JoinPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RecordsPage from "./pages/RecordsPage";
import RegisterPage from "./pages/RegisterPage";
import SponsorsPage from "./pages/SponsorsPage";
import StatsPage from './pages/StatsPage';
import TrainingPage from "./pages/TrainingPage";

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
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/highlights" element={<HighlightsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/training" element={<TrainingPage />} />
                <Route path="/records" element={<RecordsPage />} />
                <Route path="/join" element={<JoinPage />} />
                <Route path="/sponsors" element={<SponsorsPage />} />
                <Route path="/dashboard" element={<StatsPage />} />
                {/* Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Routes>
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
      </AuthProvider>
    </ThemeProvider>
  );
}