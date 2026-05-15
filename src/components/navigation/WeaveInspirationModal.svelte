<script lang="ts">
  import FloatingMenu from '../ui/FloatingMenu.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface InspirationLink {
    label: string;
    href: string;
  }

  interface InspirationItem {
    index: string;
    type: string;
    title: string;
    source: string;
    summary: string;
    adaptation: string;
    sourceNote?: string;
    links?: InspirationLink[];
  }

  interface InspirationSection {
    title: string;
    intro: string;
    items: InspirationItem[];
  }

  interface Props {
    visible: boolean;
    anchorEl?: HTMLElement | null;
    onClose: () => void;
  }

  let { visible, anchorEl = null, onClose }: Props = $props();

  const popoverTitleId = 'weave-inspiration-popover-title';

  const inspirationSections: InspirationSection[] = [
    {
      title: '底层框架与方法来源',
      intro: '这部分主要记录插件底层框架、概念定义和核心学习方法的来源。',
      items: [
        {
          index: '01',
          type: '整体框架说明',
          title: '整体框架、命名与局部早期参考',
          source: '作者个人设计；Anki（局部早期参考）',
          summary:
            'Weave 最初命名为 Tuanki。插件整体框架、整体设计与布局、和 Obsidian 功能之间的交互，以及不同应用方式下的交互组织，主要都由作者个人设计。',
          adaptation:
            '参考 Anki 的部分主要集中在记忆牌组的早期思路和表格数据库的部分表达方式，不应被写成整个插件框架都来自 Anki。'
        },
        {
          index: '02',
          type: '概念来源',
          title: '增量阅读的基础定义',
          source: 'SuperMemo',
          summary: '增量阅读的一些基本定义、术语理解与方法论起点来源于 SuperMemo。',
          adaptation:
            '在 Weave 中，这些定义已经按 Obsidian 的 Markdown、知识库组织方式和插件交互场景做了重新整理与适配。'
        },
        {
          index: '03',
          type: '算法来源',
          title: '记忆牌组调度算法',
          source: 'FSRS6',
          summary: '记忆牌组的核心调度算法来源于 FSRS6。',
          adaptation:
            '插件当前呈现的复习流程、数据承载方式、界面表达和上下游联动，是在 FSRS6 基础上结合 Weave 自身架构接入和包装后的结果。'
        }
      ]
    },
    {
      title: '界面与交互参考',
      intro: '这部分主要记录顶部功能栏、搜索面板和导航表达上的设计灵感来源。',
      items: [
        {
          index: '04',
          type: '界面参考',
          title: '搜索匹配面板',
          source: 'Obsidian 搜索匹配面板',
          summary: '搜索匹配面板的布局思路与结果反馈方式，参考了 Obsidian 自身的搜索匹配面板设计。',
          adaptation:
            '在 Weave 中又结合了卡片字段、牌组筛选和多数据源状态，改造成更贴合插件主界面的搜索工作流。'
        },
        {
          index: '05',
          type: '样式参考',
          title: '标签页导航栏的扁平化文本风格',
          source: 'Components AI 对话底部功能键',
          summary: '标签页导航栏的扁平化、极简文本显示风格，参考了 Components AI 对话底部功能键的设计语言。',
          adaptation:
            '在插件里并未原样照搬，而是结合 Obsidian 顶部栏密度、主题变量和多页面切换节奏做了重新压缩与适配。'
        },
        {
          index: '06',
          type: '视觉参考',
          title: '多彩侧边颜色条',
          source: 'Composer 主题的标题设计',
          summary: '插件中多彩侧边颜色条的视觉表达，参考了 Composer 这款 Obsidian 主题的标题设计。',
          adaptation:
            '在 Weave 里又按不同页面、状态层级和主题适配做了重新组织，不是简单把原来的颜色条直接搬过来。'
        },
        {
          index: '07',
          type: '交互参考',
          title: 'EPUB 阅读器工具条',
          source: '微信读书工具条',
          summary: 'EPUB 阅读器工具条的操作节奏和按钮组织方式，参考了微信读书的工具条设计。',
          adaptation:
            '最终落地时，为了适配 Obsidian 插件环境、阅读器状态和学习动作，做了不少减法、重排和本地化调整。'
        }
      ]
    },
    {
      title: 'AI 制卡与卡片视觉来源',
      intro: '这部分主要记录 AI 制卡的早期灵感、部分系统提示词来源，以及牌组卡片的视觉参考来源。',
      items: [
        {
          index: '08',
          type: '产品灵感',
          title: 'AI 制卡的最初设计',
          source: 'Bilibili 创作者主页',
          summary: 'AI 制卡的最初产品方向参考了该创作者公开分享的内容与思路。',
          adaptation:
            '后续实际落地的生成流程、页面组织、结果承载和与 Weave 其他模块的联动，主要是作者在插件场景里持续琢磨和迭代后的结果。',
          links: [
            {
              label: 'Bilibili 主页',
              href: 'https://space.bilibili.com/22291849'
            }
          ]
        },
        {
          index: '09',
          type: '视觉参考',
          title: '牌组卡片设计',
          source: 'Pinterest 图钉',
          sourceNote: '当前可确认作者未知',
          summary: '牌组卡片的部分视觉层次、留白感和内容排布参考了这条 Pinterest 设计案例。',
          adaptation:
            'Weave 里的卡片结构、字段组合、交互状态、主题变量适配和实际信息承载，是围绕插件需求重新拆分和调整后的版本。',
          links: [
            {
              label: 'Pinterest 参考图',
              href: 'https://www.pinterest.com/pin/281543726776717/'
            }
          ]
        },
        {
          index: '10',
          type: '提示词来源',
          title: 'AI 制卡系统提示词中的其中一条来源',
          source: '二宝学长',
          summary: 'AI 制卡系统提示词之一来源于二宝学长的分享。',
          adaptation:
            '当前插件里实际使用的是多组系统提示词和持续迭代后的提示词组织方式，已经结合 Weave 的字段结构、卡片格式、任务分工和使用体验做了大量改写与适配。',
          links: [
            {
              label: '小红书主页',
              href: 'https://www.xiaohongshu.com/user/profile/61b342b6000000001000f605?xsec_token=ABMG8xECSFbiGt4_JqvHrwtGecx60CKoNT0BJQ2eOZF4c%3D&xsec_source=pc_search'
            }
          ]
        }
      ]
    },
    {
      title: '工作区与辅助交互参考',
      intro: '这部分记录看板和日历等辅助工作区中可追溯的交互参考来源。',
      items: [
        {
          index: '11',
          type: '交互参考',
          title: '看板列设置',
          source: 'Notion',
          summary: '看板列设置的交互组织方式参考了 Notion。',
          adaptation:
            'Weave 里又按卡片学习场景加入了更贴近牌组管理的数据项和操作逻辑，不是对原方案的直接照搬。'
        },
        {
          index: '12',
          type: '调整参考',
          title: '增量阅读日历设计调整',
          source: 'obsidian-calendar-plugin',
          summary: '增量阅读日历的一些布局和节奏调整，参考了 obsidian-calendar-plugin。',
          adaptation:
            '当前实现仍然是围绕 Weave 的增量阅读数据与学习任务重新调整过的版本，重点是适配插件自身的信息密度和使用路径。',
          links: [
            {
              label: 'GitHub 仓库',
              href: 'https://github.com/liamcain/obsidian-calendar-plugin'
            }
          ]
        }
      ]
    }
  ];

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!visible) return;
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<FloatingMenu
  show={visible}
  anchor={anchorEl}
  placement="bottom-end"
  offset={10}
  onClose={onClose}
  role="dialog"
  ariaLabelledby={popoverTitleId}
  class="weave-inspiration-popover"
>
  <div class="weave-inspiration-popover__header">
    <div class="weave-inspiration-popover__heading">
      <span class="weave-inspiration-popover__kicker">来源说明</span>
      <h2 id={popoverTitleId}>设计灵感与借鉴说明</h2>
      <p>
        这份说明会尽量把目前能明确追溯的灵感与借鉴来源写清楚。标注来源不是为了淡化借鉴，
        也不是为了抹掉作者自己的改良，而是把“参考来自哪里”和“后来做了哪些适配与重构”同时说清楚。
      </p>
    </div>

    <button
      type="button"
      class="weave-inspiration-popover__close"
      onclick={onClose}
      aria-label="关闭说明"
    >
      <ObsidianIcon name="x" size={16} />
    </button>
  </div>

  <div class="weave-inspiration-popover__body">
    <section class="weave-inspiration-principles">
      <div class="weave-inspiration-principle">
        <span class="weave-inspiration-principle-label">说明原则</span>
        <p>能明确追溯的来源，会尽量直接写出参考对象或链接，不回避借鉴关系。</p>
      </div>
      <div class="weave-inspiration-principle">
        <span class="weave-inspiration-principle-label">当前版本</span>
        <p>Weave 不是简单复刻。整体框架、整体布局、与 Obsidian 的交互以及大量实际使用流程，仍然以作者个人设计与长期改良为主。</p>
      </div>
    </section>

    {#each inspirationSections as section}
      <section class="weave-inspiration-section">
        <div class="weave-inspiration-section-heading">
          <h3>{section.title}</h3>
          <p>{section.intro}</p>
        </div>

        <div class="weave-inspiration-list">
          {#each section.items as item}
            <article class="weave-inspiration-card">
              <div class="weave-inspiration-card-meta">
                <span class="weave-inspiration-index">{item.index}</span>
                <span class="weave-inspiration-type">{item.type}</span>
              </div>

              <h4>{item.title}</h4>

              <p class="weave-inspiration-source">
                <span>来源</span>
                <strong>{item.source}</strong>
                {#if item.sourceNote}
                  <em>{item.sourceNote}</em>
                {/if}
              </p>

              <p class="weave-inspiration-summary">{item.summary}</p>

              <div class="weave-inspiration-adaptation">
                <span>当前适配</span>
                <p>{item.adaptation}</p>
              </div>

              {#if item.links?.length}
                <div class="weave-inspiration-links">
                  {#each item.links as link}
                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <footer class="weave-inspiration-popover__footer">
    <p>如果后续还有新的明确来源需要补充，这里也应该继续更新，不把借鉴关系写得含糊。</p>
    <button type="button" class="mod-cta" onclick={onClose}>收起说明</button>
  </footer>
</FloatingMenu>

<style>
  :global(.floating-menu.weave-inspiration-popover) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: min(820px, calc(100vw - 24px));
    min-width: min(480px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: min(78vh, 860px);
    padding: 0;
    border-radius: 20px;
    border: 1px solid var(--background-modifier-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 24%),
      color-mix(in srgb, var(--background-primary) 96%, transparent);
    color: var(--text-normal);
    box-shadow: 0 22px 52px rgba(0, 0, 0, 0.24);
    backdrop-filter: blur(14px);
  }

  .weave-inspiration-popover__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 24px 18px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 92%, transparent);
  }

  .weave-inspiration-popover__heading {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .weave-inspiration-popover__kicker {
    font-size: 0.73rem;
    line-height: 1;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: var(--text-accent);
    text-transform: uppercase;
  }

  .weave-inspiration-popover__heading h2 {
    margin: 0;
    font-size: 1.32rem;
    line-height: 1.25;
    color: var(--text-normal);
  }

  .weave-inspiration-popover__heading p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.65;
    color: var(--text-muted);
  }

  .weave-inspiration-popover__close {
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 8px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .weave-inspiration-popover__close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .weave-inspiration-popover__body {
    flex: 1;
    overflow: auto;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .weave-inspiration-principles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .weave-inspiration-principle {
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .weave-inspiration-principle-label {
    display: inline-block;
    margin-bottom: 8px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-accent);
  }

  .weave-inspiration-principle p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.65;
    color: var(--text-muted);
  }

  .weave-inspiration-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .weave-inspiration-section-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .weave-inspiration-section-heading h3 {
    margin: 0;
    font-size: 1.02rem;
    color: var(--text-normal);
  }

  .weave-inspiration-section-heading p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.6;
    color: var(--text-muted);
  }

  .weave-inspiration-list {
    display: grid;
    gap: 12px;
  }

  .weave-inspiration-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt, var(--background-primary));
  }

  .weave-inspiration-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .weave-inspiration-index,
  .weave-inspiration-type {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: 0.76rem;
    line-height: 1;
    font-weight: 700;
  }

  .weave-inspiration-index {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .weave-inspiration-type {
    background: var(--background-secondary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
  }

  .weave-inspiration-card h4 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.45;
    color: var(--text-normal);
  }

  .weave-inspiration-source {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.84rem;
    color: var(--text-muted);
  }

  .weave-inspiration-source span,
  .weave-inspiration-adaptation span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--background-secondary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    font-size: 0.73rem;
    line-height: 1;
    font-weight: 600;
  }

  .weave-inspiration-source strong {
    color: var(--text-normal);
    font-weight: 600;
  }

  .weave-inspiration-source em {
    color: var(--text-faint);
    font-style: normal;
  }

  .weave-inspiration-summary {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--text-normal);
  }

  .weave-inspiration-adaptation {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .weave-inspiration-adaptation p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .weave-inspiration-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .weave-inspiration-links a {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--background-secondary);
    color: var(--text-accent);
    border: 1px solid var(--background-modifier-border);
    text-decoration: none;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .weave-inspiration-links a:hover {
    background: var(--background-modifier-hover);
    color: var(--text-accent-hover, var(--text-accent));
  }

  .weave-inspiration-popover__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 24px 22px;
    border-top: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-secondary) 92%, transparent);
  }

  .weave-inspiration-popover__footer p {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.6;
    color: var(--text-muted);
  }

  .weave-inspiration-popover__footer .mod-cta {
    flex-shrink: 0;
  }

  @media (max-width: 900px) {
    :global(.floating-menu.weave-inspiration-popover) {
      width: calc(100vw - 16px);
      min-width: calc(100vw - 16px);
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      border-radius: 16px;
    }

    .weave-inspiration-popover__header,
    .weave-inspiration-popover__body,
    .weave-inspiration-popover__footer {
      padding-left: 16px;
      padding-right: 16px;
    }

    .weave-inspiration-principles {
      grid-template-columns: minmax(0, 1fr);
    }

    .weave-inspiration-popover__footer {
      flex-direction: column;
      align-items: stretch;
    }

    .weave-inspiration-popover__footer .mod-cta {
      width: 100%;
      justify-content: center;
    }
  }
</style>
