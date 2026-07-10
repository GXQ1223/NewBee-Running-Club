import { render, screen, fireEvent } from '@testing-library/react';
import EventCardImage from './EventCardImage';

describe('EventCardImage', () => {
  test('renders the event image with height, lazy loading and cover styles', () => {
    render(
      <EventCardImage
        event={{ image: '/img/a.jpg', name: 'Fun Run', image_position: '20% 30%' }}
        height="150"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/img/a.jpg');
    expect(img).toHaveAttribute('alt', 'Fun Run');
    expect(img).toHaveAttribute('height', '150');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveStyle({ objectFit: 'cover', objectPosition: '20% 30%' });
  });

  test('explicit alt prop wins over event name', () => {
    render(
      <EventCardImage event={{ image: '/img/a.jpg', name: 'Fun Run' }} alt="Custom Alt" />
    );
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Custom Alt');
  });

  test('falls back to event.title for alt and center position by default', () => {
    render(<EventCardImage event={{ image: '/img/b.jpg', title: 'Title Only' }} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'Title Only');
    expect(img).toHaveStyle({ objectPosition: 'center center' });
  });

  test('supports eager loading override and sx merge', () => {
    render(
      <EventCardImage
        event={{ image: '/img/c.jpg', name: 'X' }}
        loading="eager"
        sx={{ borderRadius: '8px' }}
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveStyle({ borderRadius: '8px' });
  });

  test('forwards onError handler', () => {
    const onError = jest.fn();
    render(<EventCardImage event={{ image: '/broken.jpg', name: 'X' }} onError={onError} />);
    fireEvent.error(screen.getByRole('img'));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
