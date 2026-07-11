import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SponsorsPage from './SponsorsPage';
import { useAdmin } from '../context';
import {
  getAllDonors,
  getPublicDonors,
  createDonor,
  updateDonor,
  deleteDonor,
  getHideAmounts,
  toggleHideAmounts
} from '../api/donors';

jest.mock('../context', () => ({
  useAdmin: jest.fn(),
}));
let mockAutoFillOptions = null;
jest.mock('../hooks', () => ({
  useAutoFillOnTab: (options) => {
    mockAutoFillOptions = options;
    return jest.fn();
  },
}));
jest.mock('../api/donors', () => ({
  getAllDonors: jest.fn(),
  getPublicDonors: jest.fn(),
  createDonor: jest.fn(),
  updateDonor: jest.fn(),
  deleteDonor: jest.fn(),
  getHideAmounts: jest.fn(),
  toggleHideAmounts: jest.fn(),
}));
// The ledger has its own test suite (DonationLedger.test.js); stub it here
jest.mock('../components/DonationLedger', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'donation-ledger' });
  },
}));

const publicDonors = [
  { donation_id: 1, donor_id: 'IND_1', name: 'Jane Zhang', donor_type: 'individual', donation_date: '2026-01-15', message: 'Go NewBee!', amount: null },
  { donation_id: 2, donor_id: 'IND_2', name: 'Should Not Show', donor_type: 'individual', hide_name: true, message: 'secret note', amount: null },
  { donation_id: 3, donor_id: 'ENT_1', name: 'Acme Corp', donor_type: 'enterprise', amount: null, donation_date: '2026-02-01' },
];

const adminDonors = {
  individual_donors: [
    { donation_id: 1, donor_id: 'IND_1', name: 'Jane Zhang', donor_type: 'individual', amount: '250', donation_date: '2026-01-15', message: 'Go NewBee!', notes: 'via zelle' },
    { donation_id: 2, donor_id: 'IND_2', name: 'Hidden Henry', donor_type: 'individual', amount: '80', hide_name: true },
  ],
  enterprise_donors: [
    { donation_id: 3, donor_id: 'ENT_1', name: 'Acme Corp', donor_type: 'enterprise', amount: '1500.5', donation_date: '2026-02-01' },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <SponsorsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  getPublicDonors.mockResolvedValue(publicDonors);
  getAllDonors.mockResolvedValue(adminDonors);
  getHideAmounts.mockResolvedValue({ hide_amounts: false });
  toggleHideAmounts.mockResolvedValue({ hide_amounts: true });
  createDonor.mockResolvedValue({});
  updateDonor.mockResolvedValue({});
  deleteDonor.mockResolvedValue({});
});

describe('public view', () => {
  test('renders individual donor cards with privacy rules applied', async () => {
    renderPage();
    expect(await screen.findByText('Jane Zhang')).toBeInTheDocument();
    // Anonymous donor's name replaced and their message hidden
    expect(screen.getByText('Anonymous Donor / 匿名捐赠者')).toBeInTheDocument();
    expect(screen.queryByText('Should Not Show')).not.toBeInTheDocument();
    expect(screen.queryByText(/secret note/)).not.toBeInTheDocument();
    // Public message shown for named donor
    expect(screen.getByText('"Go NewBee!"')).toBeInTheDocument();
    // No amounts in public mode
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
    // Thank-you line for individual donors without amount
    expect(screen.getAllByText(/Thank you for your support!/).length).toBeGreaterThan(0);
    // Date chip formatted (new Date('YYYY-MM-DD') is UTC midnight, so the
    // rendered day depends on the local timezone — accept either side)
    expect(screen.getByText(/Jan 1[45], 2026/)).toBeInTheDocument();
    // Intro copy
    expect(screen.getByText(/Any contribution—large or small/)).toBeInTheDocument();
  });

  test('tabs switch between individual and enterprise donors', async () => {
    renderPage();
    const jane = await screen.findByText('Jane Zhang');
    const acme = screen.getByText('Acme Corp');
    expect(jane).toBeVisible();
    expect(acme).not.toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: /Enterprise Donors/ }));
    expect(screen.getByText('Acme Corp')).toBeVisible();
    expect(screen.getByText('Jane Zhang')).not.toBeVisible();
  });

  test('shows empty state when there are no donors', async () => {
    getPublicDonors.mockResolvedValue([]);
    renderPage();
    expect((await screen.findAllByText(/No donors yet\./)).length).toBe(2);
  });

  test('shows dismissible error alert when donor fetch fails', async () => {
    getPublicDonors.mockRejectedValue(new Error('down'));
    renderPage();
    const alert = await screen.findByText(/Failed to load donors/);
    expect(alert).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to load donors/)).not.toBeInTheDocument()
    );
  });

  test('public users see no admin affordances', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    expect(screen.queryByText(/Add Donor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Amounts Visible|Amounts Hidden/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
    expect(getHideAmounts).not.toHaveBeenCalled();
  });
});

describe('admin view', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('shows full donor data with formatted amounts, admin alert and edit/delete buttons', async () => {
    renderPage();
    expect(await screen.findByText('Jane Zhang')).toBeInTheDocument();
    expect(getAllDonors).toHaveBeenCalled();
    expect(getPublicDonors).not.toHaveBeenCalled();
    expect(screen.getByText(/Admin mode enabled/)).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('$1,500.50')).toBeInTheDocument();
    // 3 donors, each with edit + delete
    expect(screen.getAllByTestId('EditIcon')).toHaveLength(3);
    expect(screen.getAllByTestId('DeleteIcon')).toHaveLength(3);
  });

  test('hide-amounts toggle reflects setting and calls the api', async () => {
    renderPage();
    expect(await screen.findByText('Amounts Visible / 金额可见')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Amounts Visible / 金额可见'));
    expect(await screen.findByText('Amounts Hidden / 金额已隐藏')).toBeInTheDocument();
    expect(toggleHideAmounts).toHaveBeenCalled();
  });

  test('hide-amounts toggle failure shows an error alert', async () => {
    toggleHideAmounts.mockRejectedValue(new Error('nope'));
    renderPage();
    fireEvent.click(await screen.findByText('Amounts Visible / 金额可见'));
    expect(await screen.findByText(/Failed to toggle amount visibility/)).toBeInTheDocument();
  });

  test('add-donor dialog saves a new individual donor and refreshes the list', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getByText('Add Donor / 添加赞助者'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add Donor / 添加赞助者')).toBeInTheDocument();

    const saveButton = within(dialog).getByText('Save / 保存').closest('button');
    expect(saveButton).toBeDisabled(); // name + amount required

    fireEvent.change(within(dialog).getByLabelText(/Name \/ 名称/), { target: { value: 'New Donor' } });
    expect(saveButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '300' } });
    fireEvent.change(within(dialog).getByLabelText(/Message/), { target: { value: 'Keep running!' } });
    fireEvent.change(within(dialog).getByLabelText(/Donation Date/), { target: { value: '2026-07-01' } });
    // Anonymous switch
    fireEvent.click(within(dialog).getByLabelText(/Anonymous Donor/));
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(createDonor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Donor',
          donor_type: 'individual',
          amount: 300,
          donation_date: '2026-07-01',
          donation_event: 'General Support',
          message: 'Keep running!',
          hide_name: true,
          quantity: 1,
        })
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Initial fetch + refresh after save
    await waitFor(() => expect(getAllDonors).toHaveBeenCalledTimes(2));
  });

  test('adding from the enterprise tab creates an enterprise donor', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getByRole('tab', { name: /Enterprise Donors/ }));
    fireEvent.click(screen.getByText('Add Donor / 添加赞助者'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Name \/ 名称/), { target: { value: 'Big Co' } });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '1000' } });
    fireEvent.click(within(dialog).getByText('Save / 保存'));
    await waitFor(() =>
      expect(createDonor).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Big Co', donor_type: 'enterprise', amount: 1000 })
      )
    );
  });

  test('auto-fill hook is wired to the donor form fields', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getByText('Add Donor / 添加赞助者'));
    const dialog = await screen.findByRole('dialog');
    act(() => mockAutoFillOptions.setValue('name', 'Anonymous Donor'));
    expect(within(dialog).getByLabelText(/Name \/ 名称/)).toHaveValue('Anonymous Donor');
  });

  test('cancel closes the dialog without saving', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getByText('Add Donor / 添加赞助者'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createDonor).not.toHaveBeenCalled();
  });

  test('edit dialog pre-fills donor data and updates via updateDonor', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Donor / 编辑赞助者')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Name \/ 名称/)).toHaveValue('Jane Zhang');
    expect(within(dialog).getByLabelText(/Notes/)).toHaveValue('via zelle');

    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '275' } });
    fireEvent.change(within(dialog).getByLabelText(/Notes/), { target: { value: 'via check' } });
    fireEvent.click(within(dialog).getByText('Save / 保存'));
    await waitFor(() =>
      expect(updateDonor).toHaveBeenCalledWith(
        'IND_1',
        expect.objectContaining({ name: 'Jane Zhang', amount: 275, notes: 'via check', hide_name: false })
      )
    );
  });

  test('save failure shows an error alert and keeps saving state consistent', async () => {
    createDonor.mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getByText('Add Donor / 添加赞助者'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Name \/ 名称/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByText('Save / 保存'));
    expect(await screen.findByText(/Failed to save donor/)).toBeInTheDocument();
  });

  test('delete flow confirms and calls deleteDonor', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete donor "Jane Zhang"\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    await waitFor(() => expect(deleteDonor).toHaveBeenCalledWith('IND_1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(getAllDonors).toHaveBeenCalledTimes(2));
  });

  test('delete cancel closes the dialog without deleting', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteDonor).not.toHaveBeenCalled();
  });

  test('delete dialog closes on Escape', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteDonor).not.toHaveBeenCalled();
  });

  test('delete failure shows an error alert', async () => {
    deleteDonor.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findByText('Jane Zhang');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Failed to delete donor/)).toBeInTheDocument();
  });

  test('hide-amounts fetch failure is tolerated', async () => {
    getHideAmounts.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText('Jane Zhang')).toBeInTheDocument();
    expect(screen.getByText('Amounts Visible / 金额可见')).toBeInTheDocument();
  });

  test('shows the admin-only ledger tab and renders the ledger', async () => {
    renderPage();
    await screen.findByText('Jane Zhang');
    const ledgerTab = screen.getByText('All Donations · Ledger');
    expect(ledgerTab).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();

    fireEvent.click(ledgerTab);
    expect(screen.getByTestId('donation-ledger')).toBeVisible();
  });
});

describe('ledger tab visibility', () => {
  test('ledger tab is hidden in public mode', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: false });
    renderPage();
    await screen.findByText('Jane Zhang');
    expect(screen.queryByText('All Donations · Ledger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('donation-ledger')).not.toBeInTheDocument();
  });
});
