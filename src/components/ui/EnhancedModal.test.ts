import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import EnhancedModal from './EnhancedModal.svelte';

describe('EnhancedModal', () => {
  beforeEach(() => {
    // 清理 body 样式
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // 清理事件监听器
    document.removeEventListener('keydown', () => {});
    document.body.style.overflow = '';
  });

  it('renders when open is true', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: false,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).not.toBeInTheDocument();
  });

  it('applies size classes correctly', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        size: 'lg',
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).toHaveClass('tuanki-modal--lg');
  });

  it('displays title when provided', () => {
    const { getByText } = render(EnhancedModal, {
      props: {
        open: true,
        title: 'Test Modal',
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    expect(getByText('Test Modal')).toBeInTheDocument();
  });

  it('shows close button when closable is true', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        closable: true,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const closeButton = container.querySelector('.tuanki-modal__close');
    expect(closeButton).toBeInTheDocument();
  });

  it('hides close button when closable is false', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        closable: false,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const closeButton = container.querySelector('.tuanki-modal__close');
    expect(closeButton).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        closable: true,
        onClose,
        children: () => 'Modal content'
      }
    });
    
    const closeButton = container.querySelector('.tuanki-modal__close button');
    await fireEvent.click(closeButton!);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when mask is clicked and maskClosable is true', async () => {
    const onClose = vi.fn();
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        maskClosable: true,
        onClose,
        children: () => 'Modal content'
      }
    });
    
    const backdrop = container.querySelector('.tuanki-modal-backdrop');
    await fireEvent.click(backdrop!);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when mask is clicked and maskClosable is false', async () => {
    const onClose = vi.fn();
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        maskClosable: false,
        onClose,
        children: () => 'Modal content'
      }
    });
    
    const backdrop = container.querySelector('.tuanki-modal-backdrop');
    await fireEvent.click(backdrop!);
    
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed and keyboard is true', async () => {
    const onClose = vi.fn();
    render(EnhancedModal, {
      props: {
        open: true,
        keyboard: true,
        onClose,
        children: () => 'Modal content'
      }
    });
    
    await fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when Escape key is pressed and keyboard is false', async () => {
    const onClose = vi.fn();
    render(EnhancedModal, {
      props: {
        open: true,
        keyboard: false,
        onClose,
        children: () => 'Modal content'
      }
    });
    
    await fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies centered class when centered is true', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        centered: true,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const container_el = container.querySelector('.tuanki-modal-container');
    expect(container_el).toHaveClass('centered');
  });

  it('shows loading overlay when loading is true', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        loading: true,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const loadingOverlay = container.querySelector('.tuanki-modal__loading');
    expect(loadingOverlay).toBeInTheDocument();
  });

  it('renders confirm dialog with ok and cancel buttons', () => {
    const { getByText } = render(EnhancedModal, {
      props: {
        open: true,
        confirmDialog: true,
        okText: 'Confirm',
        cancelText: 'Cancel',
        onClose: vi.fn(),
        children: () => 'Confirm this action?'
      }
    });
    
    expect(getByText('Confirm')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onOk when ok button is clicked in confirm dialog', async () => {
    const onOk = vi.fn();
    const { getByText } = render(EnhancedModal, {
      props: {
        open: true,
        confirmDialog: true,
        onOk,
        onClose: vi.fn(),
        children: () => 'Confirm this action?'
      }
    });
    
    const okButton = getByText('确定');
    await fireEvent.click(okButton);
    
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked in confirm dialog', async () => {
    const onCancel = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(EnhancedModal, {
      props: {
        open: true,
        confirmDialog: true,
        onCancel,
        onClose,
        children: () => 'Confirm this action?'
      }
    });
    
    const cancelButton = getByText('取消');
    await fireEvent.click(cancelButton);
    
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets custom width and height styles', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        width: '800px',
        height: '600px',
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).toHaveStyle('width: 800px');
    expect(modal).toHaveStyle('height: 600px');
  });

  it('sets custom z-index', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        zIndex: 2000,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    const backdrop = container.querySelector('.tuanki-modal-backdrop');
    
    expect(modal).toHaveStyle('z-index: 2000');
    expect(backdrop).toHaveStyle('z-index: 1999');
  });

  it('applies custom class names', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        class: 'custom-modal',
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).toHaveClass('custom-modal');
  });

  it('passes through data attributes', () => {
    const { container } = render(EnhancedModal, {
      props: {
        open: true,
        'data-testid': 'test-modal',
        'data-custom': 'custom-value',
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    const modal = container.querySelector('.tuanki-modal');
    expect(modal).toHaveAttribute('data-testid', 'test-modal');
    expect(modal).toHaveAttribute('data-custom', 'custom-value');
  });

  it('prevents body scroll when open', () => {
    render(EnhancedModal, {
      props: {
        open: true,
        onClose: vi.fn(),
        children: () => 'Modal content'
      }
    });
    
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('handles async onOk function', async () => {
    const onOk = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(EnhancedModal, {
      props: {
        open: true,
        confirmDialog: true,
        onOk,
        onClose: vi.fn(),
        children: () => 'Confirm this action?'
      }
    });
    
    const okButton = getByText('确定');
    await fireEvent.click(okButton);
    
    expect(onOk).toHaveBeenCalledTimes(1);
  });
});
