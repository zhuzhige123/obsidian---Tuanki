import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import WeaveCardTable from '../WeaveCardTable.svelte';
import type { Card } from '../../../data/types';
import { CardState } from '../../../data/types';
import { vaultStorage } from '../../../utils/vault-local-storage';
import { DEFAULT_COLUMN_ORDER, type ColumnVisibility } from '../types/table-types';

vi.mock('../../../utils/vault-local-storage', () => ({
  vaultStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  }
}));

const mockCards: Card[] = [
  {
    id: '1',
    uuid: 'card-1',
    templateId: 'template1',
    content: '前面内容1\n---div---\n背面内容1',
    fields: {
      front: '前面内容1',
      back: '背面内容1'
    },
    tags: ['标签1', '标签2'],
    fsrs: {
      state: CardState.New,
      due: new Date().toISOString(),
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 0,
      lapses: 0,
      lastReview: undefined,
      retrievability: 1
    },
    priority: 3,
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: '2',
    uuid: 'card-2',
    templateId: 'template1',
    content: '前面内容2\n---div---\n背面内容2',
    fields: {
      front: '前面内容2',
      back: '背面内容2'
    },
    tags: ['标签3'],
    fsrs: {
      state: CardState.Learning,
      due: new Date().toISOString(),
      stability: 2,
      difficulty: 4,
      elapsedDays: 1,
      scheduledDays: 2,
      reps: 1,
      lapses: 0,
      lastReview: new Date().toISOString(),
      retrievability: 1
    },
    priority: 2,
    stats: {
      totalReviews: 1,
      totalTime: 30,
      averageTime: 30
    },
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }
];

function createColumnVisibility(overrides: Partial<ColumnVisibility> = {}): ColumnVisibility {
  const baseVisibility = {} as ColumnVisibility;

  for (const key of DEFAULT_COLUMN_ORDER) {
    baseVisibility[key] = false;
  }

  return {
    ...baseVisibility,
    ...overrides
  };
}

const defaultProps = {
  cards: mockCards,
  selectedCards: new Set<string>(),
  columnVisibility: createColumnVisibility({
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
    field_template: true
  }),
  columnOrder: [...DEFAULT_COLUMN_ORDER],
  onCardSelect: vi.fn(),
  onSelectAll: vi.fn(),
  onSort: vi.fn(),
  sortConfig: { field: 'created', direction: 'desc' as const },
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTagsUpdate: vi.fn(),
  loading: false,
  fieldTemplates: []
};

describe('WeaveCardTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vaultStorage.getItem).mockReturnValue(null);
  });

  it('renders table with cards', () => {
    render(WeaveCardTable, { props: defaultProps });
    
    expect(screen.getByText('前面内容1')).toBeInTheDocument();
    expect(screen.getByText('前面内容2')).toBeInTheDocument();
    expect(screen.getByText('正面')).toBeInTheDocument();
    expect(screen.getByText('背面')).toBeInTheDocument();
  });

  it('hides table body while loading', () => {
    render(WeaveCardTable, { 
      props: { ...defaultProps, loading: true } 
    });
    
    expect(document.querySelector('table')).toBeNull();
  });

  it('renders headers without data rows when no cards', () => {
    render(WeaveCardTable, { 
      props: { ...defaultProps, cards: [] } 
    });
    
    expect(screen.getByText('正面')).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('calls onCardSelect when checkbox is clicked', async () => {
    render(WeaveCardTable, { props: defaultProps });
    
    const checkboxes = screen.getAllByRole('checkbox');
    const firstCardCheckbox = checkboxes[1]; // Skip the "select all" checkbox
    
    await fireEvent.click(firstCardCheckbox);
    
    expect(defaultProps.onCardSelect).toHaveBeenCalledWith('card-1', true);
  });

  it('calls onSort when column header is clicked', async () => {
    render(WeaveCardTable, { props: defaultProps });
    
    const frontHeader = screen.getByText('正面').closest('th');
    await fireEvent.click(frontHeader!);
    
    expect(defaultProps.onSort).toHaveBeenCalledWith('front');
  });

  it('loads column widths from vault storage', () => {
    const savedWidths = JSON.stringify({ front: 250, back: 300 });
    vi.mocked(vaultStorage.getItem).mockReturnValue(savedWidths);
    
    render(WeaveCardTable, { props: defaultProps });
    
    expect(vaultStorage.getItem).toHaveBeenCalledWith('weave-table-column-widths');
  });

  it('displays tags correctly', () => {
    render(WeaveCardTable, { props: defaultProps });
    
    expect(screen.getByText('标签1')).toBeInTheDocument();
    expect(screen.getByText('标签2')).toBeInTheDocument();
  });

  it('calls onTagsUpdate when tags are edited', async () => {
    const { container } = render(WeaveCardTable, {
      props: { ...defaultProps, availableTags: ['标签1', '标签2', '新标签1', '新标签2'] }
    });
    
    const tagsContainer = screen.getByText('标签1').closest('button');
    const fallbackTagsContainer = container.querySelector('.weave-tags-cell');
    await fireEvent.click(tagsContainer ?? fallbackTagsContainer!);
    
    await waitFor(() => {
      expect(container.querySelector('.tag-input') || container.querySelector('.weave-tag-input')).not.toBeNull();
    });
    const input = (container.querySelector('.tag-input') || container.querySelector('.weave-tag-input')) as HTMLInputElement;
    input.value = '新标签1';
    await fireEvent.input(input);
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('新标签1')).toBeInTheDocument();

    input.value = '新标签2';
    await fireEvent.input(input);
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('新标签2')).toBeInTheDocument();

    await fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(defaultProps.onTagsUpdate).toHaveBeenCalledWith('card-1', ['标签1', '标签2', '新标签1', '新标签2']);
  });
});
