import {
    Box,
    Container,
    Grid,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';
import React from 'react';
import Logo from '../components/Logo';
import PageButtons from '../components/PageButtons';

export default function StatsPage() {
    // Placeholder data - this would come from your backend in the real implementation
    const memberData = {
        name: "John Doe",
        totalCredits: 150,
        activityCredits: 75,
        volunteerCredits: 45,
        raceCredits: 30,
        recentActivities: [
            { date: "2024-03-15", type: "Group Run", credits: 5 },
            { date: "2024-03-10", type: "Race Volunteer", credits: 10 },
            { date: "2024-03-05", type: "NYRR Race", credits: 15 },
            { date: "2024-02-28", type: "Group Run", credits: 5 },
            { date: "2024-02-20", type: "Race Volunteer", credits: 10 }
        ]
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Logo />
            <PageButtons />
            
            <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
                <Typography
                    variant="h4"
                    sx={{
                        fontWeight: 600,
                        color: '#FFA500',
                        mb: 3
                    }}
                >
                    Member Dashboard
                    会员仪表板
                </Typography>

                {/* Member Info Card */}
                <Paper sx={{ p: 3, mb: 4, backgroundColor: 'rgba(255, 165, 0, 0.05)' }}>
                    <Typography variant="h5" gutterBottom>
                        Welcome, {memberData.name}!
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        欢迎回来，{memberData.name}！
                    </Typography>
                </Paper>

                {/* Credits Overview */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255, 165, 0, 0.05)' }}>
                            <Typography variant="h6" color="text.secondary">
                                Total Credits
                            </Typography>
                            <Typography variant="h4" sx={{ color: '#FFA500', fontWeight: 'bold' }}>
                                {memberData.totalCredits}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                总积分
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255, 165, 0, 0.05)' }}>
                            <Typography variant="h6" color="text.secondary">
                                Activity Credits
                            </Typography>
                            <Typography variant="h4" sx={{ color: '#FFA500', fontWeight: 'bold' }}>
                                {memberData.activityCredits}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                活动积分
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255, 165, 0, 0.05)' }}>
                            <Typography variant="h6" color="text.secondary">
                                Volunteer Credits
                            </Typography>
                            <Typography variant="h4" sx={{ color: '#FFA500', fontWeight: 'bold' }}>
                                {memberData.volunteerCredits}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                志愿者积分
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Paper sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255, 165, 0, 0.05)' }}>
                            <Typography variant="h6" color="text.secondary">
                                Race Credits
                            </Typography>
                            <Typography variant="h4" sx={{ color: '#FFA500', fontWeight: 'bold' }}>
                                {memberData.raceCredits}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                比赛积分
                            </Typography>
                        </Paper>
                    </Grid>
                </Grid>

                {/* Recent Activities Table */}
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                        Recent Activities
                        最近活动
                    </Typography>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Date 日期</TableCell>
                                    <TableCell>Activity Type 活动类型</TableCell>
                                    <TableCell align="right">Credits 积分</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {memberData.recentActivities.map((activity, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{activity.date}</TableCell>
                                        <TableCell>{activity.type}</TableCell>
                                        <TableCell align="right">{activity.credits}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Container>
        </Box>
    );
} 