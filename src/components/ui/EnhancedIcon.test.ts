import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import EnhancedIcon from './EnhancedIcon.svelte';

describe('EnhancedIcon', () => {
  it('renders with default props', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('tuanki-icon--default');
    expect(icon).toHaveClass('tuanki-icon--md');
  });

  it('applies size classes correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', size: 'lg' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('tuanki-icon--lg');
  });

  it('applies variant classes correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', variant: 'primary' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('tuanki-icon--primary');
  });

  it('applies animation classes correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', animation: 'spin' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('tuanki-icon--spin');
  });

  it('handles disabled state', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', disabled: true }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('tuanki-icon--disabled');
  });

  it('handles clickable state', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', clickable: true }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('tuanki-icon--clickable');
    expect(icon).toHaveAttribute('tabindex', '0');
  });

  it('calls onclick handler when clicked', async () => {
    const handleClick = vi.fn();
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', onclick: handleClick }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    await fireEvent.click(icon!);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onclick when disabled', async () => {
    const handleClick = vi.fn();
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', onclick: handleClick, disabled: true }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    await fireEvent.click(icon!);
    
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('handles keyboard events for clickable icons', async () => {
    const handleClick = vi.fn();
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', onclick: handleClick, clickable: true }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    
    // Test Enter key
    await fireEvent.keyDown(icon!, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);
    
    // Test Space key
    await fireEvent.keyDown(icon!, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('renders badge when provided', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'bell', badge: '3' }
    });
    
    const badge = container.querySelector('.tuanki-icon__badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveClass('tuanki-icon__badge--primary'); // default variant
    expect(badge).toHaveClass('tuanki-icon__badge--top-right'); // default position
  });

  it('applies badge variant and position correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { 
        name: 'bell', 
        badge: '5',
        badgeVariant: 'error',
        badgePosition: 'bottom-left'
      }
    });
    
    const badge = container.querySelector('.tuanki-icon__badge');
    expect(badge).toHaveClass('tuanki-icon__badge--error');
    expect(badge).toHaveClass('tuanki-icon__badge--bottom-left');
  });

  it('sets custom color via style', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', color: '#ff0000' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('color: #ff0000');
  });

  it('sets custom opacity via style', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', opacity: 0.5 }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('opacity: 0.5');
  });

  it('applies transform styles for rotation', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', rotate: 45 }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('transform: rotate(45deg)');
  });

  it('applies transform styles for flip', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', flip: 'horizontal' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('transform: scaleX(-1)');
  });

  it('combines multiple transforms', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', rotate: 90, flip: 'both' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('transform: rotate(90deg) scaleX(-1) scaleY(-1)');
  });

  it('sets aria-label correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', ariaLabel: 'Favorite' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('aria-label', 'Favorite');
  });

  it('uses icon name as default aria-label', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('aria-label', 'star');
  });

  it('sets title attribute for tooltip', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', title: 'This is a star' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('title', 'This is a star');
  });

  it('applies custom class names', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', class: 'custom-class' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveClass('custom-class');
  });

  it('passes through data attributes', () => {
    const { container } = render(EnhancedIcon, {
      props: { 
        name: 'star',
        'data-testid': 'test-icon',
        'data-custom': 'custom-value'
      }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('data-testid', 'test-icon');
    expect(icon).toHaveAttribute('data-custom', 'custom-value');
  });

  it('handles numeric size correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', size: 32 }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('width: 32px');
    expect(icon).toHaveStyle('height: 32px');
  });

  it('handles string size with px correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', size: '24px' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveStyle('width: 24px');
    expect(icon).toHaveStyle('height: 24px');
  });

  it('sets role attribute correctly', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star', role: 'button' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('role', 'button');
  });

  it('uses default role when not specified', () => {
    const { container } = render(EnhancedIcon, {
      props: { name: 'star' }
    });
    
    const icon = container.querySelector('.tuanki-icon');
    expect(icon).toHaveAttribute('role', 'img');
  });
});
