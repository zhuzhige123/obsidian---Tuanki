import type { ScheduleItem } from '../../services/incremental-reading/IRCalendarScheduleItem';

export interface IRCalendarMaterialListProps {
  displayedMaterials: ScheduleItem[];
  hasActiveSearch: boolean;
  displayedMaterialDateKeys: Map<string, string>;
  continuousReadingEnabled: boolean;
  expandedMaterialIds: Set<string>;
  loadingSiblings: Set<string>;
  siblingCache: Map<string, ScheduleItem[]>;
  processedChunkIds: Set<string>;
  timerBusyBlockId: string | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  getDisplayedMaterialDateLabel: (materialId: string, dateKeys: Map<string, string>) => string;
  getScheduleItemDeckName: (material: ScheduleItem) => string;
  getMaterialExpandButtonLabel: (isExpanded: boolean) => string;
  handleMaterialClick: (material: ScheduleItem) => void;
  openMaterial: (material: ScheduleItem) => Promise<void>;
  toggleMaterialExpand: (material: ScheduleItem) => Promise<void> | void;
  handleMaterialContextMenu: (event: MouseEvent, anchor: HTMLElement, material: ScheduleItem) => void;
  handleLongPressStart: (event: PointerEvent, anchor: HTMLElement, material: ScheduleItem) => void;
  handleLongPressMove: (event: PointerEvent) => void;
  handleLongPressEnd: (event: PointerEvent) => void;
  openSchedulingMenu: (event: MouseEvent, material: ScheduleItem) => void;
  hasVisibleAssociatedNote: (material: ScheduleItem) => boolean;
  getAssociatedNoteActionLabel: (material: ScheduleItem) => string;
  getAssociatedNoteActionTooltip: (material: ScheduleItem) => string;
  handleAssociatedNoteClick: (event: MouseEvent, material: ScheduleItem) => void;
  isTimerRunningForBlock: (blockId: string) => boolean;
  getDisplayedTimerSeconds: (blockId: string) => number;
  getReadingTimerButtonTitle: (blockId: string) => string;
  toggleReadingTimer: (material: ScheduleItem) => Promise<void>;
  formatCompactTimerDuration: (totalSeconds: number) => string;
  formatTimerDuration: (totalSeconds: number) => string;
  formatSiblingDueDate: (nextRepDate: number) => string;
}
