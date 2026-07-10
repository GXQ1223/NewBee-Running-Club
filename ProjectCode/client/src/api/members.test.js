import { api } from './client';
import {
  syncFirebaseUser,
  getMemberByFirebaseUid,
  getMember,
  updateMember,
  updateMemberPrivacy,
  getMembersForCredits,
  getCommitteeMembers,
  getAllMembers,
  submitJoinApplication,
  submitExistingMemberAccountRequest,
  getPendingMembers,
  approveMember,
  rejectMember,
  promoteToCommittee,
  demoteFromCommittee,
} from './members';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'admin-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
});

test('syncFirebaseUser POSTs firebase user data', async () => {
  const user = { firebase_uid: 'u1', email: 'a@b.c' };
  await expect(syncFirebaseUser(user)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/members/firebase-sync', user);
});

test('getMemberByFirebaseUid GETs by firebase uid', async () => {
  await getMemberByFirebaseUid('u1');
  expect(api.get).toHaveBeenCalledWith('/api/members/firebase/u1');
});

test('getMember GETs by member id', async () => {
  await getMember(5);
  expect(api.get).toHaveBeenCalledWith('/api/members/5');
});

test('updateMember PUTs data with UID header when provided', async () => {
  const data = { bio: 'runner' };
  await expect(updateMember(5, data, 'u1')).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/members/5', data, { 'X-Firebase-UID': 'u1' });
});

test('updateMember sends empty headers without a UID', async () => {
  await updateMember(5, { bio: 'x' });
  expect(api.put).toHaveBeenCalledWith('/api/members/5', { bio: 'x' }, {});
});

test('updateMemberPrivacy PUTs both flags as query params', async () => {
  await updateMemberPrivacy(5, true, false);
  expect(api.put).toHaveBeenCalledWith(
    '/api/members/5/privacy?show_in_credits=true&show_in_donors=false',
    {}
  );
});

test('updateMemberPrivacy omits undefined flags', async () => {
  await updateMemberPrivacy(5, undefined, true);
  expect(api.put).toHaveBeenCalledWith('/api/members/5/privacy?show_in_donors=true', {});
});

test('getMembersForCredits GETs credits members', async () => {
  await getMembersForCredits();
  expect(api.get).toHaveBeenCalledWith('/api/members/credits');
});

test('getCommitteeMembers GETs the committee list', async () => {
  await getCommitteeMembers();
  expect(api.get).toHaveBeenCalledWith('/api/members/committee/list');
});

test('getAllMembers GETs all members with UID header', async () => {
  await getAllMembers(UID);
  expect(api.get).toHaveBeenCalledWith('/api/members', {}, AUTH);
});

test('submitJoinApplication POSTs the application', async () => {
  const app = { name: 'Jane', email: 'j@d.com' };
  await submitJoinApplication(app);
  expect(api.post).toHaveBeenCalledWith('/api/join/submit', app);
});

test('submitExistingMemberAccountRequest POSTs the request', async () => {
  const data = { name: 'Jane', email: 'j@d.com' };
  await submitExistingMemberAccountRequest(data);
  expect(api.post).toHaveBeenCalledWith('/api/members/existing-member-account-request', data);
});

test('getPendingMembers GETs pending list with admin header', async () => {
  await getPendingMembers(UID);
  expect(api.get).toHaveBeenCalledWith('/api/members/pending/list', {}, AUTH);
});

test('approveMember PUTs the approve endpoint with admin header', async () => {
  await approveMember(5, UID);
  expect(api.put).toHaveBeenCalledWith('/api/members/5/approve', {}, AUTH);
});

test('rejectMember PUTs the rejection reason with admin header', async () => {
  await rejectMember(5, UID, 'incomplete');
  expect(api.put).toHaveBeenCalledWith(
    '/api/members/5/reject',
    { rejection_reason: 'incomplete' },
    AUTH
  );
});

test('promoteToCommittee PUTs the promote endpoint', async () => {
  await promoteToCommittee(5, UID);
  expect(api.put).toHaveBeenCalledWith('/api/members/5/promote-to-committee', {}, AUTH);
});

test('demoteFromCommittee PUTs the demote endpoint', async () => {
  await demoteFromCommittee(5, UID);
  expect(api.put).toHaveBeenCalledWith('/api/members/5/demote-from-committee', {}, AUTH);
});

test('admin endpoints reject when no firebase UID is provided', async () => {
  const expected = 'Firebase UID is required for admin operations';
  await expect(getPendingMembers()).rejects.toThrow(expected);
  await expect(approveMember(5)).rejects.toThrow(expected);
  await expect(rejectMember(5, null, 'r')).rejects.toThrow(expected);
  await expect(promoteToCommittee(5)).rejects.toThrow(expected);
  await expect(demoteFromCommittee(5)).rejects.toThrow(expected);
  expect(api.get).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();
});
