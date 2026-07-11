import type { SupportedLanguage, TranslationKey } from "../types";

export const documentQuizTranslationOverrides: Partial<
	Record<SupportedLanguage, TranslationKey>
> = {
	"zh-CN": {
		documentQuiz: {
			commands: {
				parseAndTest: "解析并测试",
				parseSelection: "解析选中内容并测试",
			},
			toolbar: {
				parseAndTest: "解析本页笔记中的测试题并开考",
			},
			noActiveFile: "请先打开一篇 Markdown 笔记",
			readFailed: "读取笔记失败",
			noQuestions:
				"未识别到可考的测试题。请用 ## 或 <-> 分题，并使用 ---div--- 或选择题格式",
			noSelection: "请先选中要解析的测验内容",
			sessionMissing: "文档测验会话不存在或已结束",
			openFailed: "打开文档测验界面失败",
			result: {
				title: "解析结果",
				kpi: {
					total: "题目总数",
					selected: "已选题目",
					ready: "可开考",
				},
				sections: {
					types: "题型",
					difficulty: "难度",
					mastery: "掌握度",
					status: "解析状态",
				},
				types: {
					single_choice: "单选",
					multiple_choice: "多选",
					cloze: "挖空",
					qa: "问答",
					other: "其它",
				},
				difficulty: {
					easy: "简单",
					medium: "中等",
					hard: "困难",
					unset: "未标注",
				},
				mastery: {
					new: "新题",
					weak: "薄弱",
					fair: "一般",
					strong: "熟练",
				},
				status: {
					ready: "可开考",
					warn: "待确认",
					error: "不可用",
				},
				filterAll: "全部",
				filterNew: "仅新题",
				filterWeak: "仅薄弱",
				selectAll: "全选",
				selectNone: "全不选",
				emptyFilter: "当前筛选下没有题目",
				confirmWithCount: "开始考试配置（{count} 题）",
				rowMeta: {
					blockIdLabel: "块 ID",
					blockIdNew: "将自动补写块 ID",
					history: "历史 {attempts} 次 · 正确率 {accuracy}%",
				},
			},
			writeBack: {
				title: "写回笔记结果",
				summary: "成功 {succeeded} 题，失败 {failed} 题",
				failedRow: "{blockId}：{error}",
				allSuccess: "已将 {count} 道题的统计写回笔记",
			},
			contentWriteBack: {
				success: "题目内容已同步到源笔记",
				failed: "题目内容写回笔记失败：{error}",
				noSourceFile: "找不到源笔记文件，无法同步题目内容",
			},
			inlineStats: {
				attempts: "{count} 次",
				accuracy: "{percent}%",
				ariaLabel: "测验统计：{mastery}，{attempts} 次作答，正确率 {accuracy}%",
				clickToEdit: "点击编辑统计注释",
				mode: {
					exam: "考试",
				},
			},
		},
	},
	"en-US": {
		documentQuiz: {
			commands: {
				parseAndTest: "Parse and test",
				parseSelection: "Parse selection and test",
			},
			toolbar: {
				parseAndTest: "Parse test questions in this note and start an exam",
			},
			noActiveFile: "Open a Markdown note first",
			readFailed: "Failed to read the note",
			noQuestions:
				"No test questions found. Split with ## or <->, and use ---div--- or choice format",
			noSelection: "Select the quiz content first",
			sessionMissing: "Document quiz session is missing or ended",
			openFailed: "Failed to open document quiz view",
			result: {
				title: "Parse results",
				kpi: {
					total: "Total",
					selected: "Selected",
					ready: "Ready",
				},
				sections: {
					types: "Question types",
					difficulty: "Difficulty",
					mastery: "Mastery",
					status: "Parse status",
				},
				types: {
					single_choice: "Single choice",
					multiple_choice: "Multiple choice",
					cloze: "Cloze",
					qa: "Q&A",
					other: "Other",
				},
				difficulty: {
					easy: "Easy",
					medium: "Medium",
					hard: "Hard",
					unset: "Unset",
				},
				mastery: {
					new: "New",
					weak: "Weak",
					fair: "Fair",
					strong: "Strong",
				},
				status: {
					ready: "Ready",
					warn: "Needs review",
					error: "Unavailable",
				},
				filterAll: "All",
				filterNew: "New only",
				filterWeak: "Weak only",
				selectAll: "Select all",
				selectNone: "Select none",
				emptyFilter: "No questions match this filter",
				confirmWithCount: "Configure exam ({count})",
				rowMeta: {
					blockIdLabel: "Block ID",
					blockIdNew: "Block ID will be added",
					history: "History {attempts} · {accuracy}% accuracy",
				},
			},
			writeBack: {
				title: "Write-back result",
				summary: "{succeeded} succeeded, {failed} failed",
				failedRow: "{blockId}: {error}",
				allSuccess: "Wrote stats for {count} questions to the note",
			},
			contentWriteBack: {
				success: "Question content synced to the source note",
				failed: "Failed to write question content to the note: {error}",
				noSourceFile: "Source note not found; cannot sync question content",
			},
			inlineStats: {
				attempts: "{count} attempts",
				accuracy: "{percent}%",
				ariaLabel: "Quiz stats: {mastery}, {attempts} attempts, {accuracy}% accuracy",
				clickToEdit: "Click to edit stats comment",
				mode: {
					exam: "Exam",
				},
			},
		},
	},
};
