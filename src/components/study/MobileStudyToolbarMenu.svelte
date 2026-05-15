<script lang="ts">
  /**
   * 移动端学习界面工具栏菜单
   * 使用 Obsidian Menu API 构建原生风格菜单
   * 计时器信息作为菜单头部显示
   */
  import type { Card, Deck } from '../../data/types';
  import type { RatingLabelStyle } from './rating-label-style';
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import { StudyToolbarMenuBuilder, type MenuBuilderConfig, type MenuCallbacks } from '../../services/menu/StudyToolbarMenuBuilder';
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
    showTimingInfo?: boolean; // 计时信息栏是否展开
    autoPlayMedia?: boolean;
    playMediaMode?: 'first' | 'all';
    playMediaTiming?: 'cardChange' | 'showAnswer';
    playbackInterval?: number;
    cardOrder?: 'sequential' | 'random';
    choiceOptionOrder?: ChoiceOptionOrder;
    ratingLabelStyle?: RatingLabelStyle;
    showRatingIntervalOnButtons?: boolean;
    timerAutoPauseSeconds?: number;
    hintMaxUses?: number;
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
    onToggleTimingInfo?: () => void; // 切换计时信息栏
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
    onHintMaxUsesChange?: (value: number) => void;
    onClozeModeSwitchButtonToggle?: (enabled: boolean) => void;
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
    showTimingInfo = false,
    autoPlayMedia = false,
    playMediaMode = 'first',
    playMediaTiming = 'cardChange',
    playbackInterval = 2000,
    cardOrder = 'sequential',
    choiceOptionOrder = 'sequential',
    ratingLabelStyle = 'classic',
    showRatingIntervalOnButtons = false,
    timerAutoPauseSeconds = 60,
    hintMaxUses = 5,
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
    onHintMaxUsesChange,
    onClozeModeSwitchButtonToggle,
  }: Props = $props();

  // 从Store获取AI功能列表
  let customActions = $derived($customActionsForMenu);

  /**
   * 格式化时间（毫秒 -> MM:SS）
   */
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * 显示 Obsidian Menu（带计时器头部）
   */
  function showObsidianMenu() {
    if (!card) {
      onClose();
      return;
    }

    // 构建菜单配置
    const config: MenuBuilderConfig = {
      card,
      decks,
      isPremium,
      isGraphLinked,
      hasSourceFile: !!card.sourceFile,
      currentPriority: card.priority || 2,
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
      hintMaxUses,
      showClozeModeSwitchButton,
      aiActions: {
        split: customActions.split || []
      }
    };

    // 构建回调函数
    const callbacks: MenuCallbacks = {
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
      onToggleTimingInfo: onToggleTimingInfo ? () => {
        onToggleTimingInfo?.();
        // 不关闭菜单，让用户可以继续操作
      } : undefined,
      onMediaAutoPlayChange: onMediaAutoPlayChange ? (setting, value) => {
        onMediaAutoPlayChange?.(setting, value);
      } : undefined,
      onDirectDeleteToggle: onDirectDeleteToggle ? (enabled) => {
        onDirectDeleteToggle?.(enabled);
      } : undefined,
      onCardOrderChange: onCardOrderChange ? (order) => {
        onCardOrderChange?.(order);
      } : undefined,
      onChoiceOptionOrderChange: onChoiceOptionOrderChange ? (order) => {
        onChoiceOptionOrderChange?.(order);
      } : undefined,
      onRatingLabelStyleChange: onRatingLabelStyleChange ? (style) => {
        onRatingLabelStyleChange?.(style);
      } : undefined,
      onRatingIntervalButtonsToggle: onRatingIntervalButtonsToggle ? (enabled) => {
        onRatingIntervalButtonsToggle?.(enabled);
      } : undefined,
      onTimerAutoPauseChange: onTimerAutoPauseChange ? (seconds) => {
        onTimerAutoPauseChange?.(seconds);
      } : undefined,
      onHintMaxUsesChange: onHintMaxUsesChange ? (value) => {
        onHintMaxUsesChange?.(value);
      } : undefined,
      onClozeModeSwitchButtonToggle: onClozeModeSwitchButtonToggle ? (enabled) => {
        onClozeModeSwitchButtonToggle?.(enabled);
      } : undefined
    };

    // 创建菜单构建器并显示（带计时器信息）
    const menuBuilder = new StudyToolbarMenuBuilder(config, callbacks);
    
    // 在屏幕中央偏上位置显示菜单
    menuBuilder.showMenuWithTimer(
      { x: window.innerWidth / 2, y: window.innerHeight / 3 },
      { currentCardTime, averageTime, formatTime }
    );
    
    // 菜单显示后立即关闭组件状态（菜单由 Obsidian 管理）
    onClose();
  }

  // 当 show 变为 true 时，显示菜单
  $effect(() => {
    if (show && card) {
      // 延迟一帧确保状态已更新
      requestAnimationFrame(() => {
        showObsidianMenu();
      });
    }
  });
</script>

<!-- 此组件不渲染任何 DOM，仅触发 Obsidian Menu -->
