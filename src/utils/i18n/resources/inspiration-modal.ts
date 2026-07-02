import type { SupportedLanguage } from '../types';
import type { InspirationModalContent } from '../../../components/navigation/inspiration-types';

const zhInspirationContent: InspirationModalContent = {
	modalHeadings: {
		attributionTitle: "设计灵感与借鉴说明",
		syntaxTitle: "卡片语法与示例",
		attributionKicker: "来源说明",
		syntaxKicker: "题型教程",
	},
	aria: {
		close: "关闭说明",
		tablist: "说明与题型教程",
	},
	tabs: [
		{ id: "attribution", label: "来源说明" },
		{ id: "qa", label: "问答题" },
		{ id: "cloze", label: "挖空题" },
		{ id: "single-choice", label: "单选题" },
		{ id: "multi-choice", label: "多选题" },
		{ id: "image-mask", label: "图片遮罩" },
	],
	tutorials: {
		qa: {
			intro: "用 ---div--- 分隔正面（问题）与背面（答案）；Q: / A: 前缀可选。",
			rules: [
				"---div--- 必须独占一行，用于分隔问题与答案。",
				"背面可写 ---meta--- 追加 Explanation、Tags 等元数据（可选）。",
			],
			syntaxBlocks: [
				{
					title: "推荐写法",
					code: `Q: 问题内容

---div---

A: 答案内容`,
				},
				{
					title: "简化写法",
					code: `问题内容

---div---

答案内容`,
				},
			],
			example: {
				title: "完整示例",
				code: `什么是间隔重复学习的核心原理？

---div---

在即将遗忘时复习，利用遗忘曲线强化长期记忆。`,
			},
		},
		cloze: {
			intro: "在正文中用挖空标记遮住关键词；学习时点击显示。推荐使用 Obsidian 风格的 ==文本==。",
			rules: [
				"同一卡片可包含多个挖空。",
				"也兼容 Anki 风格 {{c1::文本}} 与 {{c1::文本::提示}}。",
				"可用 💡 Context: 为整段挖空提供背景说明。",
				"不要混用 == == 与 {{cN::}} 两种风格。",
			],
			syntaxBlocks: [
				{
					title: "Obsidian 风格（推荐）",
					code: "FSRS 通过 ==稳定性== 和 ==难度== 计算复习间隔。",
				},
				{
					title: "Anki 风格（兼容）",
					code: "FSRS 中的 S 代表 {{c1::Stability::记忆参数}}。",
				},
			],
			example: {
				title: "多挖空示例",
				code: `人体最大的器官是 ==皮肤==，
最长的骨骼是 ==股骨==。

💡 Context: 基础解剖常识`,
			},
		},
		"single-choice": {
			intro: "题干写问题，末尾用（字母）标明唯一正确答案；选项使用 A. B. C. D. 格式。",
			rules: [
				"题干末尾（A）或（B）等括号内写一个字母，表示单选正确答案。",
				"选项使用 A. / B. / C. / D.（字母 + 英文句点 + 空格 + 内容）。",
				"---div--- 必须独占一行，其后为解析说明（显示在背面）。",
			],
			syntaxBlocks: [
				{
					title: "标准写法",
					code: `这是一个问题？（A）

A. 这是一个选项
B. 这是一个选项
C. 这是一个选项
D. 这是一个选项

---div---

后边则是解析`,
				},
			],
			example: {
				title: "完整示例",
				code: `FSRS 算法中的「S」代表什么？（B）

A. Speed（速度）
B. Stability（稳定性）
C. Strength（强度）
D. Success（成功率）

---div---

S 表示 Stability（稳定性），是 FSRS 的核心参数之一。`,
			},
		},
		"multi-choice": {
			intro: "与单选题相同；题干末尾括号内写多个字母，如（AC），表示多选正确答案。",
			rules: [
				"题干末尾写（AC）等形式，括号内连续多个字母即为多选题答案。",
				"选项仍使用 A. B. C. D. 标准格式。",
				"---div--- 之后写解析；学习时需选出全部正确项。",
				"也可用 Answer: A,C 单独一行声明答案（可选）。",
			],
			syntaxBlocks: [
				{
					title: "标准写法",
					code: `以下哪些属于间隔重复的有效做法？（AC）

A. 在即将遗忘时复习
B. 一次性突击背完
C. 按固定间隔逐步拉长
D. 完全不做回顾

---div---

应选 A、C：间隔与提取练习结合效果最好。`,
				},
			],
			example: {
				title: "完整示例",
				code: `下列哪些属于 Content-Only 架构的优势？（ABD）

A. 简化数据模型
B. 支持复杂题型
C. 必须使用多个独立字段
D. 提升数据路径灵活性

---div---

A、B、D 为常见优势；C 描述的是传统多字段方案的特点。`,
			},
		},
		"image-mask": {
			intro: "在图片上绘制矩形/圆形遮罩，适合解剖图、地图等场景；遮罩数据保存在图片下方的 HTML 注释中。",
			rules: [
				"在笔记中插入图片后，通过右键菜单「Weave 图片遮罩」或命令打开可视化编辑器。",
				"通常无需手写 JSON；保存后插件会自动写入 <!-- weave-mask: ... -->。",
				"学习时点击遮罩区域切换显示/隐藏。",
				"一张图可设置多个遮罩块，按编号顺序学习。",
			],
			syntaxBlocks: [
				{
					title: "卡片中的基本结构",
					code: `![[示例图片.png]]

<!-- weave-mask: {"version":"1.0","masks":[...],"target":{...}} -->`,
				},
				{
					title: "推荐制卡流程",
					code: `1. 在 Markdown 中插入 ![[图片.png]]
2. 右键图片 → Weave 图片遮罩
3. 在编辑器中框选区域并保存
4. 将含遮罩的笔记制为卡片`,
				},
			],
			example: {
				title: "说明",
				code: `遮罩坐标使用 0–1 相对值存储，
可随图片缩放自适应。
具体字段由插件在保存时自动生成。`,
			},
		},
	},
	sections: [
		{
			title: "底层框架与方法来源",
			intro: "插件底层框架、概念定义与核心学习方法的来源。",
			items: [
				{
					statement: "整体框架、命名与局部早期参考来自作者个人设计；Anki（局部早期参考）",
					categoryTag: "整体框架说明",
					note: "Weave 最初命名为 Tuanki。插件整体框架、整体设计与布局、和 Obsidian 功能之间的交互，以及不同应用方式下的交互组织，主要都由作者个人设计。",
				},
				{
					statement: "增量阅读基础定义来源于 SuperMemo",
					categoryTag: "概念来源",
					note: "增量阅读的一些基本定义、术语理解与方法论起点来源于 SuperMemo。",
				},
				{
					statement: "记忆牌组算法来源为 FSRS6",
					categoryTag: "算法来源",
					note: "记忆牌组的核心调度算法来源于 FSRS6。",
				},
			],
		},
		{
			title: "界面与交互参考",
			intro: "顶部功能栏、搜索面板与导航表达上的设计参考。",
			items: [
				{
					statement: "搜索匹配面板参考 Obsidian 搜索匹配面板",
					categoryTag: "界面参考",
					note: "搜索匹配面板的布局思路与结果反馈方式，参考了 Obsidian 自身的搜索匹配面板设计。",
				},
				{
					statement: "标签页导航栏扁平化文本风格参考 Components AI 对话底部功能键",
					categoryTag: "样式参考",
					note: "标签页导航栏的扁平化、极简文本显示风格，参考了 Components AI 对话底部功能键的设计语言。",
				},
				{
					statement: "多彩侧边颜色条参考 Composer 主题标题设计",
					categoryTag: "视觉参考",
					note: "插件中多彩侧边颜色条的视觉表达，参考了 Composer 这款 Obsidian 主题的标题设计。",
				},
			],
		},
		{
			title: "工作区与辅助交互参考",
			intro: "看板、日历等辅助工作区中的交互参考。",
			items: [
				{
					statement: "看板列设置参考 Notion",
					categoryTag: "交互参考",
					note: "看板列设置的交互组织方式参考了 Notion。",
				},
				{
					statement: "增量阅读日历布局调整参考 obsidian-calendar-plugin",
					categoryTag: "调整参考",
					note: "增量阅读日历的一些布局和节奏调整，参考了 obsidian-calendar-plugin。",
					links: [
						{
							label: "GitHub 仓库",
							href: "https://github.com/liamcain/obsidian-calendar-plugin",
						},
					],
				},
			],
		},
	],
};

const enInspirationContent: InspirationModalContent = {
	modalHeadings: {
		attributionTitle: "Design inspiration and references",
		syntaxTitle: "Card syntax and examples",
		attributionKicker: "Attribution",
		syntaxKicker: "Card type guide",
	},
	aria: {
		close: "Close guide",
		tablist: "Attribution and card type guide",
	},
	tabs: [
		{ id: "attribution", label: "Attribution" },
		{ id: "qa", label: "Q&A" },
		{ id: "cloze", label: "Cloze" },
		{ id: "single-choice", label: "Single choice" },
		{ id: "multi-choice", label: "Multiple choice" },
		{ id: "image-mask", label: "Image mask" },
	],
	tutorials: {
		qa: {
			intro: "Use ---div--- on its own line to separate the question (front) from the answer (back). Q: / A: prefixes are optional.",
			rules: [
				"---div--- must be on its own line to separate question and answer.",
				"You can add ---meta--- on the back for Explanation, Tags, and other metadata (optional).",
			],
			syntaxBlocks: [
				{
					title: "Recommended format",
					code: `Q: Question text

---div---

A: Answer text`,
				},
				{
					title: "Simplified format",
					code: `Question text

---div---

Answer text`,
				},
			],
			example: {
				title: "Full example",
				code: `What is the core idea of spaced repetition?

---div---

Review just before forgetting to strengthen long-term memory using the forgetting curve.`,
			},
		},
		cloze: {
			intro: "Hide keywords in the body with cloze markers and reveal them while studying. Obsidian-style ==text== is recommended.",
			rules: [
				"A single card can contain multiple clozes.",
				"Anki-style {{c1::text}} and {{c1::text::hint}} are also supported.",
				"You can add 💡 Context: to provide background for the whole cloze block.",
				"Do not mix ==text== and {{cN::}} styles in the same card.",
			],
			syntaxBlocks: [
				{
					title: "Obsidian style (recommended)",
					code: "FSRS uses ==stability== and ==difficulty== to calculate review intervals.",
				},
				{
					title: "Anki style (compatible)",
					code: "In FSRS, S stands for {{c1::Stability::memory parameter}}.",
				},
			],
			example: {
				title: "Multiple clozes",
				code: `The largest organ in the human body is ==skin==,
and the longest bone is ==femur==.

💡 Context: Basic anatomy facts`,
			},
		},
		"single-choice": {
			intro: "Write the stem, then mark the single correct answer with (A), (B), etc. Use A. B. C. D. option lines.",
			rules: [
				"Put one letter in parentheses at the end of the stem for the correct single-choice answer.",
				"Options use A. / B. / C. / D. (letter + period + space + text).",
				"---div--- must be on its own line; the explanation goes on the back.",
			],
			syntaxBlocks: [
				{
					title: "Standard format",
					code: `Which option is correct? (A)

A. Option one
B. Option two
C. Option three
D. Option four

---div---

Explanation goes here.`,
				},
			],
			example: {
				title: "Full example",
				code: `In FSRS, what does "S" stand for? (B)

A. Speed
B. Stability
C. Strength
D. Success rate

---div---

S means Stability, one of the core FSRS parameters.`,
			},
		},
		"multi-choice": {
			intro: "Same as single choice, but put multiple letters in parentheses such as (AC) for multiple correct answers.",
			rules: [
				"Use forms like (AC) at the end of the stem for multiple correct answers.",
				"Options still use the standard A. B. C. D. format.",
				"Write the explanation after ---div---; learners must select all correct options.",
				"You can also declare answers with Answer: A,C on its own line (optional).",
			],
			syntaxBlocks: [
				{
					title: "Standard format",
					code: `Which practices support spaced repetition well? (AC)

A. Review just before forgetting
B. Cram everything in one session
C. Gradually increase intervals
D. Never review again

---div---

Choose A and C: spacing plus retrieval practice works best.`,
				},
			],
			example: {
				title: "Full example",
				code: `Which are advantages of a content-only architecture? (ABD)

A. Simpler data model
B. Supports complex card types
C. Requires many separate fields
D. More flexible data paths

---div---

A, B, and D are common advantages; C describes traditional multi-field designs.`,
			},
		},
		"image-mask": {
			intro: "Draw rectangular or circular masks on images for anatomy maps and similar use cases. Mask data is stored in an HTML comment below the image.",
			rules: [
				"After inserting an image, open the visual editor from the right-click menu “Weave image mask” or a command.",
				"You usually do not need to write JSON manually; saving writes <!-- weave-mask: ... --> automatically.",
				"Click a mask region while studying to toggle show/hide.",
				"One image can contain multiple masks, studied in numbered order.",
			],
			syntaxBlocks: [
				{
					title: "Basic structure in a card",
					code: `![[example-image.png]]

<!-- weave-mask: {"version":"1.0","masks":[...],"target":{...}} -->`,
				},
				{
					title: "Recommended workflow",
					code: `1. Insert ![[image.png]] in Markdown
2. Right-click the image → Weave image mask
3. Select regions in the editor and save
4. Turn the note with masks into a card`,
				},
			],
			example: {
				title: "Notes",
				code: `Mask coordinates are stored as 0–1 relative values,
so they scale with the image.
Specific fields are generated automatically when you save.`,
			},
		},
	},
	sections: [
		{
			title: "Core framework and methods",
			intro: "Where the plugin’s core framework, concepts, and study methods come from.",
			items: [
				{
					statement: "Overall framework, naming, and early partial references come from the author’s own design; Anki (early partial reference)",
					categoryTag: "Framework",
					note: "Weave was originally named Tuanki. The overall framework, layout, Obsidian integration, and interaction model were primarily designed by the author.",
				},
				{
					statement: "Incremental reading basics come from SuperMemo",
					categoryTag: "Concept source",
					note: "Some foundational incremental-reading definitions and terminology trace back to SuperMemo.",
				},
				{
					statement: "Memory deck scheduling uses FSRS6",
					categoryTag: "Algorithm source",
					note: "The core scheduling algorithm for memory decks comes from FSRS6.",
				},
			],
		},
		{
			title: "UI and interaction references",
			intro: "References for the top toolbar, search panel, and navigation patterns.",
			items: [
				{
					statement: "Search match panel references Obsidian’s search match panel",
					categoryTag: "UI reference",
					note: "The layout and result feedback of the search match panel were inspired by Obsidian’s own search match panel.",
				},
				{
					statement: "Flat text tab bar references Components AI footer controls",
					categoryTag: "Style reference",
					note: "The flat, text-first tab navigation style references Components AI’s footer control design.",
				},
				{
					statement: "Color side bars reference the Composer theme heading design",
					categoryTag: "Visual reference",
					note: "The colorful side bars reference heading design from the Composer Obsidian theme.",
				},
			],
		},
		{
			title: "Workspace and auxiliary interactions",
			intro: "References used in kanban, calendar, and other auxiliary workspaces.",
			items: [
				{
					statement: "Kanban column settings reference Notion",
					categoryTag: "Interaction reference",
					note: "The interaction model for kanban column settings was inspired by Notion.",
				},
				{
					statement: "Incremental reading calendar layout references obsidian-calendar-plugin",
					categoryTag: "Adjustment reference",
					note: "Some layout and rhythm adjustments in the incremental-reading calendar reference obsidian-calendar-plugin.",
					links: [
						{
							label: "GitHub repository",
							href: "https://github.com/liamcain/obsidian-calendar-plugin",
						},
					],
				},
			],
		},
	],
};

export const inspirationModalLocaleContent: Record<SupportedLanguage, InspirationModalContent> = {
	'zh-CN': zhInspirationContent,
	'en-US': enInspirationContent,
};

export function getInspirationModalLocaleContent(
	language: SupportedLanguage,
): InspirationModalContent {
	return inspirationModalLocaleContent[language] ?? inspirationModalLocaleContent['zh-CN'];
}
