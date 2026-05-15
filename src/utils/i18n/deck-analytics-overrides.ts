import type { SupportedLanguage, TranslationKey } from "./types";

export const deckAnalyticsTranslationOverrides: Partial<Record<SupportedLanguage, TranslationKey>> = {
	"zh-CN": {
		deckAnalytics: {
			updating: "更新中...",
			deckFallbackPrefix: "牌组",
			tab: {
				retention: { title: "记忆保持率", mobile: "记忆" },
				quantity: { title: "卡片数量", mobile: "数量" },
				timing: { title: "复习时机", mobile: "时机" },
				difficulty: { title: "标签难度", mobile: "难度" },
				loadForecast: { title: "负荷预测", mobile: "负荷" }
			},
			toolbar: {
				decks: "牌组",
				range: "范围",
				dataSource: "数据源",
				quickRange: "快捷范围",
				customRange: "自定义范围",
				globalDecks: "全局（所有卡片）",
				currentDeck: "当前牌组",
				globalShort: "全局",
				deckShort: "牌组",
				clearSelection: "取消全选",
				selectAll: "全选"
			},
			range: {
				separator: "至",
				daysSuffix: "天",
				scrollHint: "滚动鼠标滚轮可快速切换快捷范围"
			},
			retention: {
				avgPredictedRecall: "平均预测回忆率",
				firstReviewPassRate: "首次复习通过率",
				targetRetention: "目标保持率",
				axisX: "天数",
				axisY: "回忆 / 保持率 (%)",
				avgEmpty: "暂无可用复习历史",
				trueEmpty: "当前时间范围内没有首次复习样本"
			},
			quantity: {
				newCards: "新卡片",
				learning: "学习中",
				review: "待复习",
				mastered: "已掌握",
				masteryRate: "掌握率",
				stack: "卡片",
				axisX: "日期",
				axisCount: "卡片数量",
				axisRate: "掌握率 (%)"
			},
			difficulty: {
				axisCount: "卡片数量",
				axisDifficulty: "难度",
				count: "卡片数量",
				cardsUnit: "张"
			},
			timing: {
				early: "提前复习",
				onTime: "准时复习",
				late: "延迟复习",
				axisX: "日期",
				axisY: "百分比 (%)"
			},
			load: {
				low: "负荷低",
				normal: "正常",
				high: "负荷高",
				overload: "过载",
				axisY: "卡片数量",
				dailyLoad: "每日负荷",
				capacity: "日容量"
			}
		}
	},
	"en-US": {
		deckAnalytics: {
			updating: "Updating...",
			deckFallbackPrefix: "Deck",
			tab: {
				retention: { title: "Memory Retention", mobile: "Memory" },
				quantity: { title: "Card Quantity", mobile: "Cards" },
				timing: { title: "Review Timing", mobile: "Timing" },
				difficulty: { title: "Difficulty by Tag", mobile: "Tag Diff" },
				loadForecast: { title: "Load Forecast", mobile: "Load" }
			},
			toolbar: {
				decks: "Decks",
				range: "Range",
				dataSource: "Data Source",
				quickRange: "Quick Range",
				customRange: "Custom Range",
				globalDecks: "All selected decks",
				currentDeck: "Current deck",
				globalShort: "Global",
				deckShort: "Deck",
				clearSelection: "Clear selection",
				selectAll: "Select all"
			},
			range: {
				separator: "to",
				daysSuffix: "days",
				scrollHint: "Scroll the mouse wheel to quickly switch quick ranges"
			},
			retention: {
				avgPredictedRecall: "Avg Predicted Recall",
				firstReviewPassRate: "First Review Pass Rate",
				targetRetention: "Target Retention",
				axisX: "Days",
				axisY: "Recall / Retention (%)",
				avgEmpty: "No review history yet",
				trueEmpty: "No first-review samples in this range"
			},
			quantity: {
				newCards: "New Cards",
				learning: "Learning",
				review: "Review",
				mastered: "Mastered",
				masteryRate: "Mastery Rate",
				stack: "Cards",
				axisX: "Date",
				axisCount: "Card Count",
				axisRate: "Mastery Rate (%)"
			},
			difficulty: {
				axisCount: "Card Count",
				axisDifficulty: "Difficulty",
				count: "Cards",
				cardsUnit: " cards"
			},
			timing: {
				early: "Early",
				onTime: "On Time",
				late: "Late",
				axisX: "Date",
				axisY: "Percent (%)"
			},
			load: {
				low: "Low Load",
				normal: "Normal",
				high: "High Load",
				overload: "Overloaded",
				axisY: "Card Count",
				dailyLoad: "Daily Load",
				capacity: "Daily Capacity"
			}
		}
	}
};
