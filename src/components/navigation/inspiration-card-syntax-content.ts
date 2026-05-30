export type InspirationModalTabId =
	| "attribution"
	| "qa"
	| "cloze"
	| "single-choice"
	| "multi-choice"
	| "image-mask";

export interface InspirationModalTab {
	id: InspirationModalTabId;
	label: string;
}

export interface CardSyntaxBlock {
	title: string;
	code: string;
}

export interface CardSyntaxTutorial {
	intro: string;
	rules: string[];
	syntaxBlocks: CardSyntaxBlock[];
	example: CardSyntaxBlock;
}

export const inspirationModalTabs: InspirationModalTab[] = [
	{ id: "attribution", label: "来源说明" },
	{ id: "qa", label: "问答题" },
	{ id: "cloze", label: "挖空题" },
	{ id: "single-choice", label: "单选题" },
	{ id: "multi-choice", label: "多选题" },
	{ id: "image-mask", label: "图片遮罩" },
];

export const cardSyntaxTutorials: Record<
	Exclude<InspirationModalTabId, "attribution">,
	CardSyntaxTutorial
> = {
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
};
