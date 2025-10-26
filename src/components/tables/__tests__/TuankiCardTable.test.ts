import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import TuankiCardTable from '../TuankiCardTable.svelte';
import type { Card } from '../../../data/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock card data
const mockCards: Card[] = [
  {
    id: '1',
    templateId: 'template1',
    fields: {
      front: '前面内容1',
      back: '背面内容1'
    },
    tags: ['标签1', '标签2'],
    fsrs: {
      state: 'new',
      due: new Date(),
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 0,
      lapses: 0,
      last_review: null
    },
    priority: 3,
    created: new Date(),
    updated: new Date()
  },
  {
    id: '2',
    templateId: 'template1',
    fields: {
      front: '前面内容2',
      back: '背面内容2'
    },
    tags: ['标签3'],
    fsrs: {
      state: 'learning',
      due: new Date().toISOString(),
      stability: 2,
      difficulty: 4,
      elapsed_days: 1,
      scheduled_days: 2,
      reps: 1,
      lapses: 0,
      last_review: new Date()
    },
    priority: 2,
    created: new Date().toISOString(),
    updated: new Date()
  }
];

const defaultProps = {
  cards: mockCards,
  selectedCards: new Set<string>(),
  columnVisibility: {
    front: true,
    back: true,
    status: true,
    tags: true,
    priority: true,
    created: true,
    actions: true,
    uuid: false,
    obsidian_block_link: false,
    source_document: false,
    field_template: true, // 新增：字段模板列
  },
  onCardSelect: vi.fn(),
  onSelectAll: vi.fn(),
  onSort: vi.fn(),
  sortConfig: { field: 'created', direction: 'desc' as const },
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTagsUpdate: vi.fn(),
  loading: false,
  fieldTemplates: [] // 新增：字段模板数据
};

describe('TuankiCardTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('renders table with cards', () => {
    render(TuankiCardTable, { props: defaultProps });
    
    expect(screen.getByText('前面内容1')).toBeInTheDocument();
    expect(screen.getByText('前面内容2')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(TuankiCardTable, { 
      props: { ...defaultProps, loading: true } 
    });
    
    expect(screen.getByText('正在加载卡片...')).toBeInTheDocument();
  });

  it('shows empty state when no cards', () => {
    render(TuankiCardTable, { 
      props: { ...defaultProps, cards: [] } 
    });
    
    expect(screen.getByText('暂无卡片')).toBeInTheDocument();
  });

  it('calls onCardSelect when checkbox is clicked', async () => {
    render(TuankiCardTable, { props: defaultProps });
    
    const checkboxes = screen.getAllByRole('checkbox');
    const firstCardCheckbox = checkboxes[1]; // Skip the "select all" checkbox
    
    await fireEvent.click(firstCardCheckbox);
    
    expect(defaultProps.onCardSelect).toHaveBeenCalledWith('1', true);
  });

  it('calls onSort when column header is clicked', async () => {
    render(TuankiCardTable, { props: defaultProps });
    
    const frontHeader = screen.getByText('正面内容').closest('th');
    await fireEvent.click(frontHeader!);
    
    expect(defaultProps.onSort).toHaveBeenCalledWith('front');
  });

  it('saves and loads column widths from localStorage', () => {
    const savedWidths = JSON.stringify({ front: 250, back: 300 });
    localStorageMock.getItem.mockReturnValue(savedWidths);
    
    render(TuankiCardTable, { props: defaultProps });
    
    expect(localStorageMock.getItem).toHaveBeenCalledWith('tuanki-table-column-widths');
  });

  it('displays tags correctly', () => {
    render(TuankiCardTable, { props: defaultProps });
    
    expect(screen.getByText('标签1')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument(); // Shows +1 for additional tags
  });

  it('calls onTagsUpdate when tags are edited', async () => {
    render(TuankiCardTable, { props: defaultProps });
    
    // Click on tags container to start editing
    const tagsContainer = screen.getByText('标签1').closest('button');
    await fireEvent.click(tagsContainer!);
    
    // Find the input field and change its value
    const input = screen.getByPlaceholderText('输入标签，用逗号分隔');
    await fireEvent.input(input, { target: { value: '新标签1, 新标签2' } });
    
    // Press Enter to save
    await fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(defaultProps.onTagsUpdate).toHaveBeenCalledWith('1', ['新标签1', '新标签2']);
  });
});
