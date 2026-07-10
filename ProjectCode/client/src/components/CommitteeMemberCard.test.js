import { render, screen, fireEvent } from '@testing-library/react';
import CommitteeMemberCard from './CommitteeMemberCard';

const member = {
  name: 'Alice Chen',
  image: '/Alice Chen.png',
  position: { en: 'Board Member', zh: '委员会成员' },
};

test('renders name, both position languages, and the member image', () => {
  render(<CommitteeMemberCard member={member} onImageClick={() => {}} />);

  expect(screen.getByText('Alice Chen')).toBeInTheDocument();
  expect(screen.getByText(/Board Member/)).toBeInTheDocument();
  expect(screen.getByText(/委员会成员/)).toBeInTheDocument();

  const img = screen.getByAltText('Committee Member Alice Chen');
  expect(img).toHaveAttribute('src', '/Alice Chen.png');
  expect(img).toHaveAttribute('loading', 'lazy');
});

test('clicking the image calls onImageClick with the image path', () => {
  const onImageClick = jest.fn();
  render(<CommitteeMemberCard member={member} onImageClick={onImageClick} />);

  fireEvent.click(screen.getByAltText('Committee Member Alice Chen'));

  expect(onImageClick).toHaveBeenCalledTimes(1);
  expect(onImageClick).toHaveBeenCalledWith('/Alice Chen.png');
});

test('falls back to a PersonIcon when the image fails to load', () => {
  render(<CommitteeMemberCard member={member} onImageClick={() => {}} />);

  expect(screen.queryByTestId('PersonIcon')).not.toBeInTheDocument();
  fireEvent.error(screen.getByAltText('Committee Member Alice Chen'));

  expect(screen.getByTestId('PersonIcon')).toBeInTheDocument();
  expect(screen.queryByAltText('Committee Member Alice Chen')).not.toBeInTheDocument();
});

test('fallback area still opens the image when one exists', () => {
  const onImageClick = jest.fn();
  render(<CommitteeMemberCard member={member} onImageClick={onImageClick} />);

  fireEvent.error(screen.getByAltText('Committee Member Alice Chen'));
  fireEvent.click(screen.getByTestId('PersonIcon').parentElement);

  expect(onImageClick).toHaveBeenCalledWith('/Alice Chen.png');
});

test('members without an image render the PersonIcon and ignore clicks', () => {
  const onImageClick = jest.fn();
  const noImage = { ...member, image: null };
  render(<CommitteeMemberCard member={noImage} onImageClick={onImageClick} />);

  const icon = screen.getByTestId('PersonIcon');
  expect(icon).toBeInTheDocument();

  fireEvent.click(icon.parentElement);
  expect(onImageClick).not.toHaveBeenCalled();
});
