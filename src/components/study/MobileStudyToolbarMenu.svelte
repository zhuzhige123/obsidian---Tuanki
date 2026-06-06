<script lang="ts">
  /**
   * 移动端学习界面工具栏菜单
   * 使用 Obsidian Menu API 构建原生风格菜单
   */
  import type { Card, Deck } from '../../data/types';
  import {
    DEFAULT_RATING_LABEL_STYLE,
    shouldShowRatingIntervalOnButtons,
    type RatingLabelStyle,
  } from './rating-label-style';
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import { Menu } from 'obsidian';
  import type { MenuCallbacks } from '../../services/menu/StudyToolbarMenuBuilder';
  import { populateStudyToolbarMenuSession } from '../../services/menu/study-toolbar-menu-session';
  import { customActionsForMenu } from '../../stores/ai-config.store';

  interface Props {
    show: boolean;
    card: Card;
    currentCardTime: number;
    averageTime: number;
    decks?: Deck[];
    isPremium?: boolean;
    isGraphLinked?: boolean;
    enableDirectDelete?: boolean;
    showTimingInfo?: boolean;
    autoPlayMedia?: boolean;
    playMediaMode?: 'first' | 'all';
    playMediaTiming?: 'cardChange' | 'showAnswer';
    playbackInterval?: number;
    cardOrder?: 'sequential' | 'random';
    choiceOptionOrder?: ChoiceOptionOrder;
    ratingLabelStyle?: RatingLabelStyle;
    showRatingIntervalOnButtons?: boolean;
    timerAutoPauseSeconds?: number;
    showClozeModeSwitchButton?: boolean;
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
    onToggleTimingInfo?: () => void;
    onMediaAutoPlayChange?: (
      setting: 'enabled' | 'mode' | 'timing' | 'interval',
      value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number
    ) => void;
    onDirectDeleteToggle?: (enabled: boolean) => void;
    onCardOrderChange?: (order: 'sequential' | 'random') => void;
    onChoiceOptionOrderChange?: (order: ChoiceOptionOrder) => void;
    onRatingLabelStyleChange?: (style: RatingLabelStyle) => void;
    onRatingIntervalButtonsToggle?: (enabled: boolean) => void;
    onTimerAutoPauseChange?: (seconds: number) => void;
    onClozeModeSwitchButtonToggle?: (enabled: boolean) => void;
  }

  let {
    show = false,
    card,
    currentCardTime: _currentCardTime,
    averageTime: _averageTime,
    decks = [],
    isPremium = false,
    isGraphLinked = false,
    enableDirectDelete = false,
    showTimingInfo = false,
    autoPlayMedia = false,
    playMediaMode = 'first',
    playMediaTiming = 'cardChange',
    playbackInterval = 2000,
    cardOrder = 'sequential',
    choiceOptionOrder = 'sequential',
    ratingLabelStyle = DEFAULT_RATING_LABEL_STYLE,
    showRatingIntervalOnButtons = shouldShowRatingIntervalOnButtons(DEFAULT_RATING_LABEL_STYLE),
    timerAutoPauseSeconds = 60,
    showClozeModeSwitchButton = true,
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
    onToggleTimingInfo,
    onMediaAutoPlayChange,
    onDirectDeleteToggle,
    onCardOrderChange,
    onChoiceOptionOrderChange,
    onRatingLabelStyleChange,
    onRatingIntervalButtonsToggle,
    onTimerAutoPauseChange,
    onClozeModeSwitchButtonToggle,
  }: Props = $props();

  let customActions = $derived($customActionsForMenu);

  function buildCallbacks(): MenuCallbacks {
    return {
      onToggleEdit: () => {
        onClose();
        onToggleEdit?.();
      },
      onDelete: (skipConfirm) => {
        onClose();
        onDelete?.(skipConfirm);
      },
      onSetReminder: () => {
        onClose();
        onSetReminder?.();
      },
      onChangePriority: (priority) => {
        onClose();
        onChangePriority?.(priority);
      },
      onChangeDeck: (deckId) => {
        onClose();
        onChangeDeck?.(deckId);
      },
      onRecycleCard: () => {
        onClose();
        onRecycleCard?.();
      },
      onSplitCard: (actionId) => {
        onClose();
        onSplitCard?.(actionId);
      },
      onOpenAIConfig: () => {
        onClose();
        onOpenAIConfig?.();
      },
      onGraphLinkToggle: (enabled) => {
        onGraphLinkToggle?.(enabled);
      },
      onOpenDetailedView: () => {
        onClose();
        onOpenDetailedView?.();
      },
      onOpenSourceBlock: () => {
        onClose();
        onOpenSourceBlock?.();
      },
      onToggleTimingInfo: onToggleTimingInfo
        ? () => {
            onToggleTimingInfo?.();
          }
        : undefined,
      onMediaAutoPlayChange: onMediaAutoPlayChange
        ? (setting, value) => {
            onMediaAutoPlayChange?.(setting, value);
          }
        : undefined,
      onDirectDeleteToggle: onDirectDeleteToggle
        ? (enabled) => {
            onDirectDeleteToggle?.(enabled);
          }
        : undefined,
      onCardOrderChange: onCardOrderChange
        ? (order) => {
            onCardOrderChange?.(order);
          }
        : undefined,
      onChoiceOptionOrderChange: onChoiceOptionOrderChange
        ? (order) => {
            onChoiceOptionOrderChange?.(order);
          }
        : undefined,
      onRatingLabelStyleChange: onRatingLabelStyleChange
        ? (style) => {
            onRatingLabelStyleChange?.(style);
          }
        : undefined,
      onRatingIntervalButtonsToggle: onRatingIntervalButtonsToggle
        ? (enabled) => {
            onRatingIntervalButtonsToggle?.(enabled);
          }
        : undefined,
      onTimerAutoPauseChange: onTimerAutoPauseChange
        ? (seconds) => {
            onTimerAutoPauseChange?.(seconds);
          }
        : undefined,
      onClozeModeSwitchButtonToggle: onClozeModeSwitchButtonToggle
        ? (enabled) => {
            onClozeModeSwitchButtonToggle?.(enabled);
          }
        : undefined,
    };
  }

  function showObsidianMenu() {
    if (!card) {
      onClose();
      return;
    }

    const menu = new Menu();
    populateStudyToolbarMenuSession(menu, {
      card,
      decks,
      isPremium,
      isGraphLinked,
      enableDirectDelete,
      showTimingInfo,
      autoPlayMedia,
      playMediaMode,
      playMediaTiming,
      playbackInterval,
      cardOrder,
      choiceOptionOrder,
      ratingLabelStyle,
      showRatingIntervalOnButtons,
      timerAutoPauseSeconds,
      showClozeModeSwitchButton,
      aiSplitActions: customActions.split || [],
      callbacks: buildCallbacks(),
    });
    menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
    onClose();
  }

  $effect(() => {
    if (show && card) {
      requestAnimationFrame(() => {
        showObsidianMenu();
      });
    }
  });
</script>

<!-- 此组件不渲染任何 DOM，仅触发 Obsidian Menu -->
