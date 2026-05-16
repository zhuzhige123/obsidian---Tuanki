
import { moveItem, moveItemByInsertionIndex, resolveReorderTargetIndex } from '../reorder';

describe('reorder utils', () => {
  it('moves an item to the target index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('keeps the list unchanged for invalid positions', () => {
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 99)).toEqual(['a', 'b']);
  });

  it('resolves insertion indexes for pointer-based reorder', () => {
    expect(resolveReorderTargetIndex(1, 0, 4)).toBe(0);
    expect(resolveReorderTargetIndex(1, 2, 4)).toBe(1);
    expect(resolveReorderTargetIndex(1, 4, 4)).toBe(3);
  });

  it('moves an item by insertion index', () => {
    expect(moveItemByInsertionIndex(['a', 'b', 'c', 'd'], 1, 4)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItemByInsertionIndex(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd']);
  });
});
