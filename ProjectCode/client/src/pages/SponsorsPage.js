import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, Switch, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import { useEffect, useState } from 'react';
import NavigationButtons from '../components/NavigationButtons';
import { useAdmin } from '../context';
import { useAutoFillOnTab } from '../hooks';
import { getAllDonors, getPublicDonors, createDonor, updateDonor, deleteDonor, getHideAmounts, toggleHideAmounts } from '../api/donors';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

export default function SponsorsPage() {
  const { adminModeEnabled } = useAdmin();
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
    hide_name: false
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
      setError('Failed to load donors. Please try again. / 加载赞助者失败，请重试。');
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
      hide_name: donor.hide_name || false
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
      hide_name: false
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingDonor(null);
    setDonorFormData({ name: '', amount: '', donation_date: '', message: '', notes: '', hide_name: false });
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
          hide_name: donorFormData.hide_name
        });
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
          hide_name: donorFormData.hide_name
        });
      }
      handleCloseEditDialog();
      fetchDonors(); // Refresh the list
    } catch (err) {
      console.error('Error saving donor:', err);
      setError('Failed to save donor. Please try again. / 保存赞助者失败，请重试。');
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
      await deleteDonor(editingDonor.donor_id);
      setDeleteDialogOpen(false);
      setEditingDonor(null);
      fetchDonors(); // Refresh the list
    } catch (err) {
      console.error('Error deleting donor:', err);
      setError('Failed to delete donor. Please try again. / 删除赞助者失败，请重试。');
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
          <CircularProgress sx={{ color: '#FFA500' }} />
        </Box>
      );
    }

    if (donors.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            No donors yet. / 暂无赞助者。
          </Typography>
        </Box>
      );
    }

    return (
      <Grid container spacing={2}>
        {donors.map((donor) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={donor.donation_id}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
                    {donor.hide_name ? 'Anonymous Donor / 匿名捐赠者' : donor.name}
                  </Typography>
                  {adminModeEnabled && (
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
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
                </Box>

                {/* Show amount only in admin mode */}
                {adminModeEnabled && (
                  <Typography variant="h5" sx={{ color: '#FFA500', fontWeight: 600, mb: 1 }}>
                    {donor.amount ? formatAmount(donor.amount) : formatAmount(0)}
                  </Typography>
                )}

                {/* Always show date chip when available */}
                {donor.donation_date && (
                  <Chip
                    label={formatDate(donor.donation_date)}
                    size="small"
                    sx={{ mb: 1, backgroundColor: 'rgba(255, 165, 0, 0.1)' }}
                  />
                )}

                {/* Show "Thank you!" message for individual donors when amount is hidden */}
                {!donor.amount && !adminModeEnabled && donor.donor_type === 'individual' && (
                  <Typography variant="body2" sx={{ color: '#FFA500', fontWeight: 500, mb: 1 }}>
                    Thank you for your support! / 感谢您的支持！
                  </Typography>
                )}

                {donor.message && !donor.hide_name && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
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
      <NavigationButtons />

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
            Admin mode enabled. You can add, edit, and delete donors. / 管理员模式已开启，您可以添加、编辑和删除赞助者。
          </Alert>
        </Container>
      )}

      {/* Sponsors Text */}
      <Container maxWidth="xl" sx={{ px: 2, mt: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            color: '#FFA500',
            mb: 2,
            fontSize: { xs: '1.25rem', sm: '1.75rem', md: '2.125rem' },
            textAlign: 'center'
          }}
        >
          Our Sponsors/Donors
          <br />
          我们的赞助者/赞助商
        </Typography>

        {adminModeEnabled && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 3 }}>
            <Button
              variant={hideAmounts ? 'contained' : 'outlined'}
              startIcon={hideAmounts ? <VisibilityOffIcon /> : <VisibilityIcon />}
              onClick={handleToggleHideAmounts}
              sx={{
                textTransform: 'none',
                borderColor: '#FFB84D',
                color: hideAmounts ? 'white' : '#FFB84D',
                backgroundColor: hideAmounts ? '#FFB84D' : 'transparent',
                '&:hover': {
                  backgroundColor: hideAmounts ? '#FFA833' : 'rgba(255, 184, 77, 0.08)',
                  borderColor: '#FFA833',
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
                backgroundColor: '#FFB84D',
                color: 'white',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#FFA833',
                }
              }}
            >
              Add Donor / 添加赞助者
            </Button>
          </Box>
        )}

        {!adminModeEnabled && <Box sx={{ mb: 3 }} />}
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
            每一份捐赠，无论多少，都意义非凡。感谢您考虑为新蜂跑团捐赠。您的支持帮助我们组织跑步活动、更好地服务会员，共同建设一个更强大、更健康、更紧密的社区。欢迎通过 Zelle：newbeerunningclub@gmail.com 支持跑团运作。
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
            Any contribution—large or small—makes a meaningful difference. Thank you for considering a gift to the NewBee Running Club. Your support enables us to organize running programs and better serve our members, fostering a stronger, healthier, and more connected community. Donate via Zelle: newbeerunningclub@gmail.com.
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
            padding: { xs: '8px 0', sm: '12px 0' },
            width: '50%',
            fontWeight: 600,
            color: 'rgba(102, 102, 102, 0.25)',
            '&.Mui-selected': {
              color: '#FFA500',
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: '#FFA500',
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
                  fontSize: { xs: '1rem', sm: '1.5rem', md: '2.125rem' },
                  fontWeight: 600,
                  textAlign: 'center',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.3
                }}>
                  {`Individual Donors\n个人赞助者`}
                </Typography>
              }
            />
            <Tab
              label={
                <Typography sx={{
                  fontSize: { xs: '1rem', sm: '1.5rem', md: '2.125rem' },
                  fontWeight: 600,
                  textAlign: 'center',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.3
                }}>
                  {`Enterprise Donors\n企业赞助者`}
                </Typography>
              }
            />
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
      </Container>

      {/* Edit/Add Donor Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingDonor ? 'Edit Donor / 编辑赞助者' : 'Add Donor / 添加赞助者'}
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
            helperText="This message will be displayed publicly on the sponsors page. / 此留言将公开显示在赞助页面。"
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
              backgroundColor: '#FFB84D',
              '&:hover': { backgroundColor: '#FFA833' }
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
            确定要删除赞助者 "{editingDonor?.name}" 吗？
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
