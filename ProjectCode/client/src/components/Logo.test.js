import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Logo from './Logo';

function renderLogo() {
  return render(
    <MemoryRouter>
      <Logo />
    </MemoryRouter>
  );
}

test('renders the club logo image', () => {
  renderLogo();
  const img = screen.getByAltText('NewBee Running Club Logo');
  expect(img).toBeInTheDocument();
  expect(img).toHaveAttribute('src', '/PageLogo.png');
});

test('wraps the logo in a link to the homepage', () => {
  renderLogo();
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', '/');
  expect(link).toContainElement(screen.getByAltText('NewBee Running Club Logo'));
});
