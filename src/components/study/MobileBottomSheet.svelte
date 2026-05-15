<script lang="ts">
  import type { Card, Deck } from '../../data/types';
  import MobileStudyToolbarMenu from './MobileStudyToolbarMenu.svelte';

  interface Props {
    show: boolean;
    card: Card;
    currentCardTime: number;
    averageTime: number;
    decks?: Deck[];
    isPremium?: boolean;
    isGraphLinked?: boolean;
    enableDirectDelete?: boolean;
    autoPlayMedia?: boolean;
    cardOrder?: 'sequential' | 'random';
    onClose: () => void;
    onToggleEdit?: () => void;
    onDelete?: (skipConfirm?: boolean) => void;
    onSetReminder?: () => void;
    onChangePriority?: (priority: number) => void;
    onChangeDeck?: (deckId: string) => void | Promise<void>;
    onRecycleCard?: () => void;
    onSplitCard?: (actionId: string) => void;
    onOpenAIConfig?: () => void;
    onGraphLinkToggle?: (enabled: boolean) => void;
    onOpenDetailedView?: () => void;
    onOpenSourceBlock?: () => void;
    onDirectDeleteToggle?: (enabled: boolean) => void;
    onMediaAutoPlayChange?: (setting: string, value: any) => void;
    onCardOrderChange?: (order: 'sequential' | 'random') => void;
  }

  let {
    show = false,
    card,
    currentCardTime,
    averageTime,
    decks = [],
    isPremium = false,
    isGraphLinked = false,
    enableDirectDelete = false,
    autoPlayMedia = false,
    cardOrder = 'sequential',
    onClose,
    onToggleEdit,
    onDelete,
    onSetReminder,
    onChangePriority,
    onChangeDeck,
    onRecycleCard,
    onSplitCard,
    onOpenAIConfig,
    onGraphLinkToggle,
    onOpenDetailedView,
    onOpenSourceBlock,
    onDirectDeleteToggle,
    onMediaAutoPlayChange,
    onCardOrderChange,
  }: Props = $props();
 </script>

<MobileStudyToolbarMenu
  {show}
  {card}
  {currentCardTime}
  {averageTime}
  {decks}
  {isPremium}
  {isGraphLinked}
  {enableDirectDelete}
  {autoPlayMedia}
  {cardOrder}
  {onClose}
  {onToggleEdit}
  {onDelete}
  {onSetReminder}
  {onChangePriority}
  {onChangeDeck}
  {onRecycleCard}
  {onSplitCard}
  {onOpenAIConfig}
  {onGraphLinkToggle}
  {onOpenDetailedView}
  {onOpenSourceBlock}
  {onDirectDeleteToggle}
  {onMediaAutoPlayChange}
  {onCardOrderChange}
/>
