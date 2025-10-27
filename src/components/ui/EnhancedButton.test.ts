import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import '@testing-library/jest-dom';
import EnhancedButton from './EnhancedButton.svelte';

// 辅助函数：创建文本 Snippet
function createTextSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
    setup: () => {}
  }));
}

describe('EnhancedButton', () => {
  it('renders with default props', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        children: createTextSnippet('Test Button')
      }
    });

    const button = getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Test Button');
    expect(button).toHaveClass('tuanki-btn--secondary');
    expect(button).toHaveClass('tuanki-btn--md');
  });

  it('applies variant classes correctly', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        variant: 'primary',
        children: createTextSnippet('Primary Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--primary');
  });

  it('applies size classes correctly', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        size: 'lg',
        children: createTextSnippet('Large Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--lg');
  });

  it('handles disabled state', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        disabled: true,
        children: createTextSnippet('Disabled Button')
      }
    });

    const button = getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('tuanki-btn--disabled');
  });

  it('handles loading state', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        loading: true,
        children: createTextSnippet('Loading Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--loading');
  });

  it('calls onclick handler when clicked', async () => {
    const handleClick = vi.fn();
    const { getByRole } = render(EnhancedButton, {
      props: {
        onclick: handleClick,
        children: createTextSnippet('Clickable Button')
      }
    });
    
    const button = getByRole('button');
    await fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onclick when disabled', async () => {
    const handleClick = vi.fn();
    const { getByRole } = render(EnhancedButton, {
      props: {
        onclick: handleClick,
        disabled: true,
        children: createTextSnippet('Disabled Button')
      }
    });

    const button = getByRole('button');
    await fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onclick when loading', async () => {
    const handleClick = vi.fn();
    const { getByRole } = render(EnhancedButton, {
      props: {
        onclick: handleClick,
        loading: true,
        children: createTextSnippet('Loading Button')
      }
    });

    const button = getByRole('button');
    await fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders as link when href is provided', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        href: 'https://example.com',
        children: createTextSnippet('Link Button')
      }
    });

    const link = getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('applies fullWidth class', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        fullWidth: true,
        children: createTextSnippet('Full Width Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--full-width');
  });

  it('applies rounded class', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        rounded: true,
        children: createTextSnippet('Rounded Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--rounded');
  });

  it('applies iconOnly class', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        iconOnly: true,
        icon: 'plus',
        ariaLabel: 'Add'
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('tuanki-btn--icon-only');
    expect(button).toHaveAttribute('aria-label', 'Add');
  });

  it('sets aria-label correctly', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        ariaLabel: 'Custom Label',
        children: createTextSnippet('Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Custom Label');
  });

  it('sets title attribute for tooltip', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        tooltip: 'This is a tooltip',
        children: createTextSnippet('Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveAttribute('title', 'This is a tooltip');
  });

  it('applies custom class names', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        class: 'custom-class another-class',
        children: createTextSnippet('Custom Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveClass('custom-class');
    expect(button).toHaveClass('another-class');
  });

  it('sets button type correctly', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        type: 'submit',
        children: createTextSnippet('Submit Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('passes through data attributes', () => {
    const { getByRole } = render(EnhancedButton, {
      props: {
        'data-testid': 'test-button',
        'data-custom': 'custom-value',
        children: createTextSnippet('Data Button')
      }
    });

    const button = getByRole('button');
    expect(button).toHaveAttribute('data-testid', 'test-button');
    expect(button).toHaveAttribute('data-custom', 'custom-value');
  });
});
