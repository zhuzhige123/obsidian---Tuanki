<script lang="ts">
	import { setIcon } from 'obsidian';

	interface Props {
		visible: boolean;
		onClose: () => void;
	}

	let { visible, onClose }: Props = $props();

	let activeTab = $state<'basics' | 'highlight' | 'note' | 'tools' | 'credits'>('basics');

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				// /skip innerHTML is used to clear the trusted icon container before setIcon rerenders it
				node.replaceChildren();
				setIcon(node, newName);
			}
		};
	}

	function switchTab(tab: typeof activeTab) {
		activeTab = tab;
	}

	const tabs = [
		{ id: 'basics' as const, label: '基础阅读' },
		{ id: 'highlight' as const, label: '高亮标注' },
		{ id: 'note' as const, label: '摘录笔记' },
		{ id: 'tools' as const, label: '工具功能' },
		{ id: 'credits' as const, label: '致谢' }
	];
</script>

{#if visible}
	<div
		class="epub-tutorial-overlay"
		onclick={onClose}
		onkeydown={(event) => event.key === 'Escape' && onClose()}
		role="button"
		tabindex="0"
		aria-label="关闭教程"
	></div>

	<div class="epub-tutorial-panel">
		<div class="epub-tutorial-header">
			<span>书籍阅读器使用教程</span>
			<button class="epub-tutorial-close" onclick={onClose} aria-label="关闭教程">
				<span use:icon={'x'}></span>
			</button>
		</div>

		<div class="epub-tutorial-tabs">
			{#each tabs as tab}
				<button
					class:active={activeTab === tab.id}
					onclick={() => switchTab(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<div class="epub-tutorial-scroll">
			<div class="epub-tutorial-body">
				{#if activeTab === 'basics'}
					<div class="epub-tut-section">
						<div class="epub-tut-title">打开书籍文件</div>
						<div class="epub-tut-text">
							<p>把书籍文件放进 Obsidian 仓库后，点击文件即可打开。阅读器会自动保存并恢复阅读进度。</p>
							<p>当前支持 <code>.epub</code>、<code>.mobi</code>、<code>.azw3</code>、<code>.fb2</code>、<code>.fbz</code>、<code>.txt</code>、<code>.cbz</code>。</p>
							<p>其中 EPUB、FB2/FBZ、TXT 更适合导出为结构化 Markdown；CBZ 更偏图片型内容，导出后会以图片资源为主。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">侧边栏</div>
						<div class="epub-tut-text">
							<p>点击标题栏中的 <span class="epub-tut-icon" use:icon={'panel-left'}></span> 按钮可以打开侧边栏：</p>
							<ul>
								<li><strong>目录</strong>：按章节快速跳转</li>
								<li><strong>笔记</strong>：查看高亮和笔记内容</li>
								<li><strong>书签</strong>：管理阅读书签</li>
							</ul>
							<p>侧边栏底部的 <span class="epub-tut-icon" use:icon={'library'}></span> 按钮可以切换到书架视图，浏览仓库中的书籍文件。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">布局模式</div>
						<div class="epub-tut-text">
							<p>标题栏布局按钮支持多种阅读模式：</p>
							<ul>
								<li><strong>翻页模式</strong> <span class="epub-tut-icon" use:icon={'file-text'}></span>：适合逐页阅读</li>
								<li><strong>双栏模式</strong> <span class="epub-tut-icon" use:icon={'book-open'}></span>：模拟摊开书本的阅读感</li>
							</ul>
							<p>可以配合键盘方向键进行翻页。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">显示设置</div>
						<div class="epub-tut-text">
							<ul>
								<li><strong>宽度模式</strong> <span class="epub-tut-icon" use:icon={'align-center'}></span>：切换标准宽度与更宽布局</li>
							</ul>
						</div>
					</div>
				{:else if activeTab === 'highlight'}
					<div class="epub-tut-section">
						<div class="epub-tut-title">文本高亮</div>
						<div class="epub-tut-text">
							<p>选中文本后会弹出工具栏，左侧提供多种高亮颜色。</p>
							<div class="epub-tut-colors">
								<div class="epub-tut-color-item">
									<span class="epub-tut-color-dot yellow"></span>
									<span>黄色：常规标记</span>
								</div>
								<div class="epub-tut-color-item">
									<span class="epub-tut-color-dot green"></span>
									<span>绿色：重点内容</span>
								</div>
								<div class="epub-tut-color-item">
									<span class="epub-tut-color-dot blue"></span>
									<span>蓝色：思考笔记</span>
								</div>
								<div class="epub-tut-color-item">
									<span class="epub-tut-color-dot red"></span>
									<span>红色：疑问标记</span>
								</div>
								<div class="epub-tut-color-item">
									<span class="epub-tut-color-dot purple"></span>
									<span>紫色：延伸联想</span>
								</div>
							</div>
							<p>高亮会以 <code>[!EPUB|color]</code> 引用块的形式保存在 Markdown 笔记中。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">高亮回显</div>
						<div class="epub-tut-text">
							<p>再次打开同一本 EPUB 时，阅读器会扫描仓库中的相关 Markdown 笔记，自动恢复高亮与关联内容。</p>
							<h4>工作方式</h4>
							<ul>
								<li>高亮本身就是笔记的一部分，天然支持搜索与引用</li>
								<li>图谱中可以看到 EPUB 与笔记之间的关联</li>
								<li>数据随笔记一起管理，不需要额外维护独立数据库</li>
							</ul>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">引用块格式</div>
						<div class="epub-tut-text">
							<p>高亮会保存为 Obsidian 标准引用块：</p>
							<pre>> [!EPUB|yellow] [[book.epub#^ch1|Chapter 1]]
> highlighted text content</pre>
							<p>支持的颜色有 <code>yellow</code>、<code>blue</code>、<code>red</code>、<code>purple</code>、<code>green</code>。</p>
						</div>
					</div>
				{:else if activeTab === 'note'}
					<div class="epub-tut-section">
						<div class="epub-tut-title">自动模式</div>
						<div class="epub-tut-text">
							<p>标题栏中的 <span class="epub-tut-icon" use:icon={'zap'}></span> <strong>自动</strong> 按钮控制选中文本后的输出行为：</p>
							<ul>
								<li><strong>关闭</strong>：复制到剪贴板</li>
								<li><strong>开启</strong>：直接插入到当前 Markdown 编辑器光标位置</li>
							</ul>
							<p>开启后，高亮、复制和摘录都会尽量带上精确定位链接。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">选中工具栏</div>
						<div class="epub-tut-text">
							<p>选中文本后弹出的工具栏主要包含以下操作：</p>
							<h4>标注区</h4>
							<ul>
								<li>多色高亮</li>
								<li>下划线</li>
								<li>笔记</li>
							</ul>
							<h4>输出区</h4>
							<ul>
								<li>复制或插入摘录</li>
								<li>生成 Cloze 卡片</li>
								<li>提取卡片</li>
								<li>AI 解释</li>
							</ul>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">EPUB 链接系统</div>
						<div class="epub-tut-text">
							<p>从 EPUB 提取的引用会尽量带上 CFI 精确定位，点击链接可以直接跳回原文位置。</p>
							<h4>链接示例</h4>
							<pre>[[book.epub#^ch1|Chapter 1 > selected text]]</pre>
							<p>这些链接也能参与 Obsidian 图谱与双向链接系统。</p>
						</div>
					</div>
				{:else if activeTab === 'tools'}
					<div class="epub-tut-section">
						<div class="epub-tut-title">导出为 Markdown</div>
						<div class="epub-tut-text">
							<p>导出入口以 Obsidian 视图标题栏右侧的菜单为准。</p>
							<ul>
								<li><strong>导出当前章节</strong>：把当前章导出为 Markdown，并把图片写入附件文件夹</li>
								<li><strong>导出阅读笔记</strong>：把当前书籍的高亮与摘录整理为 Markdown</li>
							</ul>
							<p>如果章节里包含图片，导出时会尽量转成 Obsidian 的图片嵌入语法，而不是保留运行时链接。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">截图工具</div>
						<div class="epub-tut-text">
							<p>点击标题栏中的 <span class="epub-tut-icon" use:icon={'camera'}></span> 按钮进入截图模式，在阅读区域拖拽即可截图。</p>
							<h4>保存模式</h4>
							<p>通过 <span class="epub-tut-icon" use:icon={'image'}></span> 按钮切换保存方式：</p>
							<ul>
								<li><strong>图片模式</strong>：保存为图片文件，Auto 开启时可自动插入</li>
								<li><strong>嵌入模式</strong>：提取选区文字，Auto 开启时插入带定位的引用</li>
							</ul>
							<p>自动模式关闭时，结果会复制到剪贴板。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">快捷键</div>
						<div class="epub-tut-text">
							<div class="epub-tut-shortcut-list">
								<div class="epub-tut-shortcut">
									<kbd>←</kbd> <kbd>→</kbd>
									<span>翻页或切换双栏视图中的页面</span>
								</div>
							</div>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">标题栏按钮一览</div>
						<div class="epub-tut-text">
							<div class="epub-tut-btn-list">
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'panel-left'}></span>
									<span>打开侧边栏</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'a-large-small'}></span>
									<span>显示设置</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'image'}></span>
									<span>切换截图保存模式</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'camera'}></span>
									<span>打开截图工具</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'zap'}></span>
									<span>切换自动模式</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'scroll-text'}></span>
									<span>切换布局模式</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'align-center'}></span>
									<span>切换宽度模式</span>
								</div>
								<div class="epub-tut-btn-item">
									<span class="epub-tut-icon" use:icon={'circle-help'}></span>
									<span>打开教程</span>
								</div>
							</div>
							<p>导出相关操作位于 Obsidian 视图菜单中，不再单独占用标题栏按钮。</p>
						</div>
					</div>
				{:else if activeTab === 'credits'}
					<div class="epub-tut-section">
						<div class="epub-tut-title">EPUB 解析引擎</div>
						<div class="epub-tut-text">
							<p>EPUB 文件阅读现已完全基于 <strong>foliate-js</strong> 内核；历史阅读定位仍会自动兼容迁移。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">EPUB 链接系统</div>
						<div class="epub-tut-text">
							<p>EPUB 链接追踪的设计参考了 <strong>Obsidian PDF++</strong> 插件的优秀思路。</p>
						</div>
					</div>

					<div class="epub-tut-divider"></div>

					<div class="epub-tut-section">
						<div class="epub-tut-title">Canvas 联动</div>
						<div class="epub-tut-text">
							<p>EPUB 阅读器与 Obsidian Canvas 的联动体验参考了 <strong>MarginNote</strong> 的阅读与脑图工作流。</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
