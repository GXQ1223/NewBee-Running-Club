import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import { useEffect, useState } from 'react';
import { useAdmin, useAuth } from '../context';
import { useAutoFillOnTab } from '../hooks';
import DonationLedger from '../components/DonationLedger';
import DonationHeroCard from '../components/DonationHeroCard';
import { getAllDonors, getPublicDonors, createDonor, updateDonor, deleteDonor, getHideAmounts, toggleHideAmounts } from '../api/donors';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';

export default function SponsorsPage() {
  const { adminModeEnabled } = useAdmin();
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;
  const [individualDonors, setIndividualDonors] = useState([]);
  const [enterpriseDonors, setEnterpriseDonors] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Hide amounts toggle
  const [hideAmounts, setHideAmounts] = useState(false);

  // Admin dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingDonor, setEditingDonor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [donorFormData, setDonorFormData] = useState({
    name: '',
    amount: '',
    donation_date: '',
    message: '',
    notes: '',
    hide_name: false,
    hide_message: false
  });

  // Default values for Tab auto-fill
  const donorDefaultValues = {
    name: 'Anonymous Donor',
    amount: '100.00',
    message: 'Thank you for your support!',
    notes: 'N/A'
  };

  const handleAutoFill = useAutoFillOnTab({
    setValue: (field, value) => setDonorFormData(prev => ({ ...prev, [field]: value })),
    defaultValues: donorDefaultValues
  });

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const fetchDonors = async () => {
    setLoading(true);
    setError('');
    try {
      if (adminModeEnabled) {
        // Admin users get full donor data
        const data = await getAllDonors();
        setIndividualDonors(data.individual_donors || []);
        setEnterpriseDonors(data.enterprise_donors || []);
      } else {
        // Public users get privacy-filtered donor data
        const donors = await getPublicDonors();
        setIndividualDonors(donors.filter(d => d.donor_type === 'individual'));
        setEnterpriseDonors(donors.filter(d => d.donor_type === 'enterprise'));
      }
    } catch (err) {
      console.error('Error fetching donors:', err);
      setError('Failed to load donors. Please try again. / 加载捐赠者失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDonors();
    if (adminModeEnabled) {
      getHideAmounts().then(data => setHideAmounts(data.hide_amounts)).catch(err => console.error('Error fetching hide amounts:', err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminModeEnabled]);

  // Leave the admin-only ledger tab if admin mode is turned off
  useEffect(() => {
    if (!adminModeEnabled && selectedTab === 2) {
      setSelectedTab(0);
    }
  }, [adminModeEnabled, selectedTab]);

  const handleToggleHideAmounts = async () => {
    try {
      const data = await toggleHideAmounts();
      setHideAmounts(data.hide_amounts);
    } catch (err) {
      console.error('Error toggling hide amounts:', err);
      setError('Failed to toggle amount visibility. / 切换金额可见性失败。');
    }
  };

  const handleEditDonor = (donor) => {
    setEditingDonor(donor);
    setDonorFormData({
      name: donor.name || '',
      amount: donor.amount || '',
      donation_date: donor.donation_date || '',
      message: donor.message || '',
      notes: donor.notes || '',
      hide_name: donor.hide_name || false,
      hide_message: donor.hide_message || false
    });
    setEditDialogOpen(true);
  };

  const handleAddDonor = () => {
    setEditingDonor(null);
    setDonorFormData({
      name: '',
      amount: '',
      donation_date: new Date().toISOString().split('T')[0],
      message: '',
      notes: '',
      hide_name: false,
      hide_message: false
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingDonor(null);
    setDonorFormData({ name: '', amount: '', donation_date: '', message: '', notes: '', hide_name: false, hide_message: false });
  };

  const handleSaveDonor = async () => {
    setSaving(true);
    try {
      if (editingDonor) {
        // Update existing donor
        await updateDonor(editingDonor.donor_id, {
          name: donorFormData.name,
          amount: parseFloat(donorFormData.amount),
          donation_date: donorFormData.donation_date || null,
          message: donorFormData.message || null,
          notes: donorFormData.notes || null,
          hide_name: donorFormData.hide_name,
          hide_message: donorFormData.hide_message
        }, firebaseUid);
      } else {
        // Create new donor
        const donorType = selectedTab === 0 ? 'individual' : 'enterprise';
        const donorId = `${donorType.toUpperCase().slice(0, 3)}_${Date.now()}`;
        await createDonor({
          donor_id: donorId,
          name: donorFormData.name,
          donor_type: donorType,
          amount: parseFloat(donorFormData.amount),
          quantity: 1,
          donation_date: donorFormData.donation_date || null,
          donation_event: 'General Support',
          message: donorFormData.message || null,
          notes: donorFormData.notes || null,
          hide_name: donorFormData.hide_name,
          hide_message: donorFormData.hide_message
        }, firebaseUid);
      }
      handleCloseEditDialog();
      fetchDonors(); // Refresh the list
    } catch (err) {
      console.error('Error saving donor:', err);
      setError('Failed to save donor. Please try again. / 保存捐赠者失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (donor) => {
    setEditingDonor(donor);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setSaving(true);
    try {
      await deleteDonor(editingDonor.donor_id, firebaseUid);
      setDeleteDialogOpen(false);
      setEditingDonor(null);
      fetchDonors(); // Refresh the list
    } catch (err) {
      console.error('Error deleting donor:', err);
      setError('Failed to delete donor. Please try again. / 删除捐赠者失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatAmount = (amount) => {
    if (!amount) return '$0';
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Render donor cards
  const renderDonorCards = (donors) => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      );
    }

    if (donors.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            No donors yet. / 暂无捐赠者。
          </Typography>
        </Box>
      );
    }

    return (
      <Grid container spacing={2}>
        {donors.map((donor) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={donor.donation_id}>
            <Card
              elevation={0}
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'white',
                border: `1px solid ${LINE}`,
                borderRadius: '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(255,165,0,0.35)',
                  transform: 'translateY(-3px)'
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="h6" component="div" noWrap sx={{ fontWeight: 600, color: INK, fontSize: '1.05rem', flex: 1, minWidth: 0 }}>
                    {donor.hide_name ? 'Anonymous Donor / 匿名捐赠者' : donor.name}
                  </Typography>
                  {adminModeEnabled && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                      <Tooltip title="Edit / 编辑">
                        <IconButton size="small" onClick={() => handleEditDonor(donor)}>
                          <EditIcon fontSize="small" color="primary" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete / 删除">
                        <IconButton size="small" onClick={() => handleDeleteClick(donor)}>
                          <DeleteIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                  {donor.donation_date && (
                    <Chip
                      label={formatDate(donor.donation_date)}
                      size="small"
                      sx={{ flexShrink: 0, backgroundColor: ORANGE_BG, color: ORANGE, fontWeight: 700, borderRadius: '99px' }}
                    />
                  )}
                </Box>

                {/* Show amount only in admin mode */}
                {adminModeEnabled && (
                  <Typography variant="h5" sx={{ color: ORANGE, fontWeight: 700, mb: 1 }}>
                    {donor.amount ? formatAmount(donor.amount) : formatAmount(0)}
                  </Typography>
                )}

                {/* Show "Thank you!" message for individual donors when amount is hidden */}
                {!donor.amount && !adminModeEnabled && donor.donor_type === 'individual' && (
                  <Typography variant="body2" sx={{ color: ORANGE, fontWeight: 500, mb: 1 }}>
                    Thank you for your support! / 感谢您的支持！
                  </Typography>
                )}

                {/* One-line donation message; committee can hide it per donation */}
                {donor.message && !donor.hide_name && !donor.hide_message && (
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 1, fontStyle: 'italic' }}>
                    "{donor.message}"
                  </Typography>
                )}
                {/* Admin still sees a hidden message, struck through */}
                {adminModeEnabled && donor.message && !donor.hide_name && donor.hide_message && (
                  <Typography variant="body2" noWrap sx={{ mt: 1, fontStyle: 'italic', color: '#bbb', textDecoration: 'line-through' }}>
                    "{donor.message}"
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Navigation Buttons */}

      {/* Error Alert */}
      {error && (
        <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        </Container>
      )}

      {/* Admin Mode Alert */}
      {adminModeEnabled && (
        <Container maxWidth="xl" sx={{ px: 2, mt: 2 }}>
          <Alert severity="info" icon={<InfoIcon />}>
            Admin mode enabled. You can add, edit, and delete donors. / 管理员模式已开启，您可以添加、编辑和删除捐赠者。
          </Alert>
        </Container>
      )}

      {/* Hero Donation Card — the page banner */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 3 }}>
        <DonationHeroCard />
      </Container>

      {/* Donors Header */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: INK }}>
            Our Donors
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
            我们的捐赠者
          </Typography>
        </Box>

        {adminModeEnabled && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 3 }}>
            <Button
              variant={hideAmounts ? 'contained' : 'outlined'}
              startIcon={hideAmounts ? <VisibilityOffIcon /> : <VisibilityIcon />}
              onClick={handleToggleHideAmounts}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                px: 2.5,
                boxShadow: 'none',
                border: `1.5px solid ${ORANGE}`,
                color: hideAmounts ? 'white' : ORANGE,
                backgroundColor: hideAmounts ? ORANGE : 'transparent',
                '&:hover': {
                  backgroundColor: hideAmounts ? ORANGE_DARK : ORANGE,
                  color: 'white',
                  border: `1.5px solid ${hideAmounts ? ORANGE_DARK : ORANGE}`,
                  boxShadow: 'none',
                }
              }}
            >
              {hideAmounts ? 'Amounts Hidden / 金额已隐藏' : 'Amounts Visible / 金额可见'}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddDonor}
              sx={{
                backgroundColor: ORANGE,
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '99px',
                px: 2.5,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: ORANGE_DARK,
                  boxShadow: 'none',
                }
              }}
            >
              Add Donor / 添加捐赠者
            </Button>
          </Box>
        )}

        {!adminModeEnabled && <Box sx={{ mb: 1 }} />}
      </Container>

      {/* Donors Tabs Section */}
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 0 }}>
        <Box sx={{
          borderBottom: `1px solid ${LINE}`,
          '& .MuiTabs-root': {
            minHeight: 'unset',
          },
          '& .MuiTab-root': {
            minHeight: 'unset',
            padding: { xs: '10px 0', sm: '12px 0' },
            width: adminModeEnabled ? '33.33%' : '50%',
            textTransform: 'none',
            color: MUTED,
            '&.Mui-selected': {
              color: ORANGE,
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: ORANGE,
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
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: { xs: '0.9375rem', sm: '1.05rem' }, fontWeight: 700 }}>
                    Individual Donors
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, color: MUTED }}>
                    个人捐赠者
                  </Typography>
                </Box>
              }
            />
            <Tab
              label={
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: { xs: '0.9375rem', sm: '1.05rem' }, fontWeight: 700 }}>
                    Enterprise Donors
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, color: MUTED }}>
                    企业捐赠者
                  </Typography>
                </Box>
              }
            />
            {adminModeEnabled && (
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: { xs: '0.9375rem', sm: '1.05rem' }, fontWeight: 700 }}>
                      All Donations · Ledger
                    </Typography>
                    <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, color: MUTED }}>
                      捐款账本
                    </Typography>
                    <Chip
                      label="ADMIN"
                      size="small"
                      sx={{ fontSize: '0.625rem', fontWeight: 700, height: 18, borderRadius: '99px', backgroundColor: INK, color: 'white' }}
                    />
                  </Box>
                }
              />
            )}
          </Tabs>
        </Box>

        {/* Individual Donors Tab Panel */}
        <Box sx={{ display: selectedTab === 0 ? 'block' : 'none', mt: 3 }}>
          {renderDonorCards(individualDonors)}
        </Box>

        {/* Enterprise Donors Tab Panel */}
        <Box sx={{ display: selectedTab === 1 ? 'block' : 'none', mt: 3 }}>
          {renderDonorCards(enterpriseDonors)}
        </Box>

        {/* Admin Donation Ledger Tab Panel */}
        {adminModeEnabled && (
          <Box sx={{ display: selectedTab === 2 ? 'block' : 'none', mt: 3 }}>
            <DonationLedger onLedgerChange={fetchDonors} />
          </Box>
        )}
      </Container>

      {/* Edit/Add Donor Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingDonor ? 'Edit Donor / 编辑捐赠者' : 'Add Donor / 添加捐赠者'}
        </DialogTitle>
        <DialogContent>
          <TextField
            name="name"
            fullWidth
            label="Name / 名称"
            value={donorFormData.name}
            onChange={(e) => setDonorFormData({ ...donorFormData, name: e.target.value })}
            onKeyDown={handleAutoFill}
            placeholder={donorDefaultValues.name}
            margin="normal"
            required
          />
          <TextField
            name="amount"
            fullWidth
            label="Amount ($) / 金额"
            type="number"
            value={donorFormData.amount}
            onChange={(e) => setDonorFormData({ ...donorFormData, amount: e.target.value })}
            onKeyDown={handleAutoFill}
            placeholder={donorDefaultValues.amount}
            margin="normal"
            required
            inputProps={{ min: 0, step: 0.01 }}
          />
          <TextField
            fullWidth
            label="Donation Date / 捐款日期"
            type="date"
            value={donorFormData.donation_date}
            onChange={(e) => setDonorFormData({ ...donorFormData, donation_date: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            name="message"
            fullWidth
            label="Message (Public) / 留言（公开显示）"
            value={donorFormData.message}
            onChange={(e) => setDonorFormData({ ...donorFormData, message: e.target.value })}
            onKeyDown={handleAutoFill}
            placeholder={donorDefaultValues.message}
            margin="normal"
            multiline
            rows={2}
            helperText="This message will be displayed publicly on the donors page. / 此留言将公开显示在捐赠页面。"
          />
          <TextField
            name="notes"
            fullWidth
            label="Notes (Admin only) / 备注（仅管理员可见）"
            value={donorFormData.notes}
            onChange={(e) => setDonorFormData({ ...donorFormData, notes: e.target.value })}
            onKeyDown={handleAutoFill}
            placeholder={donorDefaultValues.notes}
            margin="normal"
            multiline
            rows={2}
          />
          <FormControlLabel
            control={
              <Switch
                checked={donorFormData.hide_name}
                onChange={(e) => setDonorFormData({ ...donorFormData, hide_name: e.target.checked })}
                color="warning"
              />
            }
            label="Anonymous Donor / 匿名捐赠者"
            sx={{ mt: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={donorFormData.hide_message}
                onChange={(e) => setDonorFormData({ ...donorFormData, hide_message: e.target.checked })}
                color="warning"
              />
            }
            label="Hide message / 隐藏留言"
            sx={{ mt: 1, display: 'flex' }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseEditDialog} disabled={saving}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveDonor}
            disabled={saving || !donorFormData.name || !donorFormData.amount}
            sx={{
              backgroundColor: ORANGE,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '99px',
              px: 2.5,
              boxShadow: 'none',
              '&:hover': { backgroundColor: ORANGE_DARK, boxShadow: 'none' }
            }}
          >
            {saving ? <CircularProgress size={20} /> : 'Save / 保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete / 确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete donor "{editingDonor?.name}"?
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            确定要删除捐赠者 "{editingDonor?.name}" 吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Delete / 删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
