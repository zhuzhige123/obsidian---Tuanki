<script lang="ts">
  import type { Card } from "../../data/types";
  import type { TestQuestionRecord } from "../../types/question-bank-types";

  interface Props {
    questions: TestQuestionRecord[];
    currentIndex: number;
    onJumpToQuestion: (index: number) => void;
    columnMode?: 1 | 3;
  }

  let { questions, currentIndex, onJumpToQuestion, columnMode = 3 }: Props = $props();

  // 按题型分组
  interface QuestionGroup {
    type: 'choice' | 'cloze' | 'qa';
    label: string;
    questions: Array<{
      index: number;
      record: TestQuestionRecord;
      status: 'unanswered' | 'correct' | 'wrong' | 'current';
    }>;
    collapsed: boolean;
  }

  let groups = $state<QuestionGroup[]>([]);

  // 题型映射
  const typeConfig = {
    choice: { label: '选择题' },
    cloze: { label: '填空题' },
    qa: { label: '问答题' }
  };

  // 根据题目类型归类
  function getQuestionType(question: Card): 'choice' | 'cloze' | 'qa' {
    const metadata = question.metadata?.questionMetadata;
    if (!metadata) return 'qa';
    
    const type = metadata.type;
    if (type === 'single_choice' || type === 'multiple_choice' || type === 'choice') {
      return 'choice';
    } else if (type === 'cloze') {
      return 'cloze';
    } else {
      return 'qa';
    }
  }

  // 获取题目状态
  function getQuestionStatus(index: number, record: TestQuestionRecord): 'unanswered' | 'correct' | 'wrong' | 'current' {
    if (index === currentIndex) return 'current';
    if (record.isCorrect === undefined || record.isCorrect === null) return 'unanswered';
    return record.isCorrect ? 'correct' : 'wrong';
  }

  // 更新分组数据
  $effect(() => {
    const typeGroups = new Map<string, QuestionGroup>();
    
    questions.forEach((record, index) => {
      const type = getQuestionType(record.question);
      
      if (!typeGroups.has(type)) {
        typeGroups.set(type, {
          type,
          label: typeConfig[type].label,
          questions: [],
          collapsed: false
        });
      }
      
      typeGroups.get(type)!.questions.push({
        index,
        record,
        status: getQuestionStatus(index, record)
      });
    });
    
    groups = Array.from(typeGroups.values());
  });

  // 切换分组折叠状态
  function toggleGroup(group: QuestionGroup) {
    group.collapsed = !group.collapsed;
    groups = [...groups];
  }

  // 跳转到题目
  function jumpToQuestion(index: number) {
    onJumpToQuestion(index);
  }

  // 计算网格单元格（补全空位）
  function getGridCells(groupQuestions: any[]) {
    const cells = [...groupQuestions];
    
    // 单列模式不需要补全
    if (columnMode === 1) {
      return cells;
    }
    
    // 三列模式补全空位
    const remainder = cells.length % 3;
    if (remainder > 0) {
      const emptyCount = 3 - remainder;
      for (let i = 0; i < emptyCount; i++) {
        cells.push({ isEmpty: true });
      }
    }
    return cells;
  }
</script>

<div class="question-navigator" class:single-column={columnMode === 1}>
  {#each groups as group (group.type)}
    <div class="nav-group" class:collapsed={group.collapsed}>
      <button
        class="group-header {group.type === 'choice' ? 'accent-blue' : group.type === 'cloze' ? 'accent-purple' : 'accent-orange'}"
        onclick={() => toggleGroup(group)}
      >
        <div class="group-header-left">
          <div class="group-title">{group.label}</div>
        </div>
        <span class="collapse-icon">▼</span>
      </button>

      {#if !group.collapsed}
        <div class="grid-container" data-columns={columnMode}>
          {#each getGridCells(group.questions) as cell}
            {#if cell.isEmpty}
              <div class="nav-cell empty"></div>
            {:else}
              <button
                class="nav-cell {cell.status}"
                onclick={() => jumpToQuestion(cell.index)}
                title="题目 {cell.index + 1}"
              >
                {cell.index + 1}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* ==================== 导航容器 ==================== */
  .question-navigator {
    width: 150px;
    height: 100%;
    background: transparent;
    border-radius: 0;
    padding: 16px 12px 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    overflow-x: hidden;
    box-shadow: none;
    scrollbar-width: thin;
    scrollbar-color: var(--background-modifier-border) transparent;
    border: none;
    outline: none;
  }

  /* 单列模式：缩小容器宽度 */
  .question-navigator.single-column {
    width: 100px;
    min-width: 80px;
  }

  /* 自定义滚动条 */
  .question-navigator::-webkit-scrollbar {
    width: 6px;
  }

  .question-navigator::-webkit-scrollbar-track {
    background: transparent;
  }

  .question-navigator::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .question-navigator::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* ==================== 题型分组 ==================== */
  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 10px 18px;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    
    /* 彻底移除所有边框和阴影 */
    border: none;
    outline: none;
    box-shadow: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    
    user-select: none;
    position: relative;
    color: var(--text-normal);
  }
  
  .group-header:focus,
  .group-header:focus-visible {
    outline: none;
    box-shadow: none;
    border: none;
  }
  
  .group-header:active {
    box-shadow: none;
    border: none;
  }

  .group-header:hover {
    background: var(--background-modifier-hover);
  }

  /* 多彩渐变侧边条 */
  .group-header::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 20px;
    border-radius: 2px;
  }

  /* 蓝色渐变 - 选择题 */
  .group-header.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(37, 99, 235, 0.7));
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
  }

  /* 紫色渐变 - 填空题 */
  .group-header.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(147, 51, 234, 0.7));
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
  }

  /* 橙色渐变 - 问答题 */
  .group-header.accent-orange::before {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(234, 88, 12, 0.7));
    box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
  }

  .group-header-left {
    display: flex;
    align-items: center;
  }

  .group-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .collapse-icon {
    font-size: 10px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
    font-weight: 600;
  }

  .nav-group.collapsed .collapse-icon {
    transform: rotate(-90deg);
  }

  .nav-group.collapsed .grid-container {
    display: none;
  }

  /* ==================== 网格布局 ==================== */
  .grid-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 0 6px;
  }

  /* 单列显示模式 */
  .grid-container[data-columns="1"] {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 0 4px;
  }

  .nav-cell {
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    border: none;
    padding: 0;
  }

  /* 空占位 */
  .nav-cell.empty {
    visibility: hidden;
    pointer-events: none;
    border: none;
    background: transparent;
  }

  /* 未答题 */
  .nav-cell.unanswered {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    border-color: var(--background-modifier-border-hover);
  }

  .nav-cell.unanswered:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--background-modifier-border-focus);
    transform: scale(1.1);
  }

  /* 已答正确 */
  .nav-cell.correct {
    background: #10b981;
    color: white;
    border-color: #10b981;
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
  }

  .nav-cell.correct:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
  }

  /* 已答错误 */
  .nav-cell.wrong {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.25);
  }

  .nav-cell.wrong:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 10px rgba(239, 68, 68, 0.35);
  }

  /* 当前题 */
  .nav-cell.current {
    background: var(--background-modifier-border);
    color: var(--text-normal);
    border-color: #667eea;
    border-width: 3px;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
    animation: pulse-current 2.5s ease-in-out infinite;
  }

  @keyframes pulse-current {
    0%, 100% {
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3),
                  0 0 12px rgba(102, 126, 234, 0.2);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2),
                  0 0 20px rgba(102, 126, 234, 0.15);
    }
  }

  /* ==================== 响应式 ==================== */
  @media (max-width: 768px) {
    .question-navigator {
      width: 100%;
      max-height: 300px;
      margin-bottom: 20px;
    }

    .grid-container {
      grid-template-columns: repeat(5, 1fr);
    }
    
    .grid-container[data-columns="1"] {
      grid-template-columns: 1fr;
    }
  }
</style>
