import type { SupportedLanguage, TranslationKey } from '../types';

export const settingsTranslations: Record<SupportedLanguage, TranslationKey> = {
	'zh-CN': {

		settings: {
			title: "设置",
			categories: {
				basic: "基础",
				memoryLearning: "记忆学习",
				fsrs6: "FSRS6算法",
				cardParsing: "批量解析",
				aiConfig: "AI服务",
				incrementalReading: "增量阅读",
				virtualization: "性能优化",
				dataManagement: "备份与维护",
				ankiConnect: "Anki配置",
				pluginSystem: "插件",
				about: "关于",
			},
			basic: {
				title: "基础设置",
				language: {
					label: "语言",
					chinese: "简体中文",
					english: "English",
					description: "选择界面显示语言",
				},
				defaultDeck: {
					label: "默认牌组",
					placeholder: "输入默认牌组名称",
					description: "未学习卡片默认添加到此牌组",
				},
				notifications: {
					label: "启用通知",
					description: "显示学习提醒和系统通知",
				},
				floatingButton: {
					label: "显示悬浮新建按钮",
					description: "在界面右下角显示快速新建按钮",
				},
				shortcuts: {
					label: "启用键盘快捷键",
					description: "学习模式的键盘快捷键（1-4评分，空格显示答案）",
				},
				debugMode: {
					label: "调试模式",
					description: "启用后将在浏览器控制台输出详细的调试日志信息",
					enabled: "调试模式已启用，控制台将输出详细日志",
					disabled: "调试模式已关闭",
				},
				showPerformanceSettings: {
					label: "性能优化界面",
					description: "显示或隐藏性能优化设置选项",
					shownMessage: "性能优化界面已显示",
					hiddenMessage: "性能优化界面已隐藏",
				},
				progressiveCloze: {
					title: "渐进式挖空",
					historyInheritance: {
						label: "历史数据继承",
						description: "当卡片转换为渐进式挖空时，如何处理原有的学习历史",
						first: "第一个子挖空继承（推荐）",
						proportional: "所有子挖空按比例继承",
						reset: "全部重置为新卡片",
						prompt: "每次提示我选择",
					},
					updateMessage: "渐进式挖空历史继承策略已更新",
				},
				deckCardStyle: {
					label: "牌组卡片设计",
					description: "选择牌组学习界面中卡片的视觉风格",
					options: {
						default: "默认样式",
						chineseElegant: "典雅风格",
					},
					updateMessage: "牌组卡片设计已更新",
				},
			},
			editor: {
				title: "编辑器设置",
				description: "配置卡片编辑器和链接格式",
				editorMode: {
					label: "编辑器模式",
					markdownMode: "Markdown 模式",
					description: "统一使用Markdown格式进行卡片编辑",
				},
				linkStyle: {
					label: "链接样式",
				},
				linkPath: {
					label: "链接路径",
				},
				preferAlias: {
					label: "优先使用别名",
				},
				attachmentDir: {
					label: "附件目录",
				},
				embedImages: {
					label: "自动嵌入图片",
				},
				linkPathDisplay: {
					short: "最短",
					relative: "相对",
					absolute: "绝对",
				},
				window: {
					title: "编辑器窗口设置",
					enableResize: {
						label: "启用拖拽调整",
						description: "允许通过拖拽边框调整编辑窗口尺寸",
					},
					windowSize: {
						label: "窗口尺寸",
						description: "选择编辑窗口的默认大小",
					},
					rememberSize: {
						label: "记住上次尺寸",
						description: "下次打开时恢复上次的窗口大小",
					},
					sizePresets: {
						small: "小",
						medium: "中",
						large: "大",
						fullscreen: "全屏",
						custom: "自定义",
					},
				},
			},
			learning: {
				title: "学习设置",
				reviewsPerDay: {
					label: "每日复习数量",
					description: "每天计划复习的卡片数量上限",
				},
				newCardsPerDay: {
					label: "每日未学习数量",
					description: "每天学习的未学习卡片数量上限",
				},
				learningSteps: {
					label: "学习步骤（分钟）",
					description: "用逗号分隔多个时间间隔",
					placeholder: "1, 10",
				},
				graduatingInterval: {
					label: "毕业间隔（天）",
					description: "卡片从学习阶段毕业后的初始复习间隔",
					placeholder: "1",
				},
				autoAdvance: {
					label: "自动前进",
					description: "评分后自动显示下一张卡片",
					delay: "延迟（秒）",
				},
			},
			siblingDispersion: {
				title: "兄弟卡片智能分散",
				saved: "兄弟卡片分散设置已保存",
				saveFailed: "保存失败，请重试",
				enabledNotice: "兄弟卡片智能分散已启用",
				resetToDefaults: "已重置为推荐配置",
				whatIs: "什么是兄弟卡片分散？",
				description:
					"渐进式挖空会为一张卡片创建多个子卡片（兄弟卡片）。为了避免记忆干扰，这些兄弟卡片不应在相近日期出现。",
				benefit: "启用后可提升学习效果，减少前摄干扰和倒摄干扰，符合认知科学研究和Anki最佳实践。",
				enable: {
					label: "启用智能分散",
					description: "自动管理兄弟卡片的学习日期，避免在同一学习会话或相近日期出现",
				},
				parameters: {
					title: "核心参数",
				},
				minSpacing: {
					label: "最小间隔天数",
					description: "兄弟卡片之间的最小时间间隔（推荐：5天）",
				},
				spacingPercentage: {
					label: "动态分散比例",
					description: "基于复习间隔的动态调整比例（推荐：5%）",
					hint: "实际间隔 = max(最小间隔, 复习间隔 × 此比例)",
				},
				example: {
					title: "分散效果示例",
				},
				features: {
					title: "功能开关",
				},
				filterInQueue: {
					label: "队列生成时过滤",
					description: "避免同一学习会话中出现兄弟卡片（立即生效）",
					recommendation: "强烈推荐开启",
				},
				autoAdjustAfterReview: {
					label: "复习后动态调整",
					description: "复习后自动调整冲突的兄弟卡片due日期",
					recommendation: "推荐开启，持续优化",
				},
				respectFuzzRange: {
					label: "遵守FSRS的fuzz范围",
					description: "仅在FSRS的fuzz范围内调整，不破坏最优复习间隔",
					recommendation: "必须开启，确保科学性",
				},
				resetButton: "重置为推荐配置",
				resetHint: "基于Anki社区标准和CleverDeck最佳实践",
				science: {
					title: "科学依据",
					interference: {
						title: "记忆干扰理论",
						proactive: "前摄干扰",
						proactiveDesc: "先学习的内容干扰后学习内容的记忆",
						retroactive: "倒摄干扰",
						retroactiveDesc: "后学习的内容干扰先学习内容的记忆",
						consolidation: "记忆巩固",
						consolidationDesc: "新记忆需要时间才能稳固，相似内容连续学习会降低效果",
					},
					references: {
						title: "参考标准",
					},
					benefits: {
						title: "预期效果",
						retention: "提高长期记忆率",
						interference: "减少记忆干扰",
						efficiency: "提升学习效率",
						fsrs: "完美兼容FSRS算法",
					},
				},
			},
			navigation: {
				title: "导航可见性",
				description: "控制主界面导航项的显示",
			},
			cardParsing: {
				title: "批量解析配置",
				premiumPrompt: "批量解析功能可让您一次性处理多个文件或文件夹。升级到高级版以解锁此功能。",
				regexManagement: {
					title: "正则匹配管理",
					addMapping: "添加映射",
					presets: {
						defaultMode: "默认模式（新用户）",
						qaMode: "Q&A 模式",
						standardDivider: "标准分隔模式",
						basicMode: "初级模式",
						ankiExport: "Anki 导出模式",
					},
					tableHeaders: {
						type: "类型",
						path: "路径",
						filePrefix: "文件前缀",
						regexPattern: "正则匹配",
						targetDeck: "目标牌组",
						subfolders: "子文件夹",
						outerCover: "外层叠盖",
						enabled: "启用",
						actions: "操作",
					},
					actions: {
						enable: "启用",
						delete: "删除",
						edit: "编辑",
					},
				},
				preset: {
					title: "编辑正则预设",
					presetName: "预设名称",
					parseMode: "解析模式",
					cardSeparation: "卡片分隔方式",
					useCustomSeparator: "使用自定义分隔符",
					useLineSeparator: "使用全行分隔",
					cardSeparator: "卡片分隔符",
					frontBackSeparator: "正反面分隔符",
					syncMethod: "同步方法",
					excludeTags: "排除标签（逗号分隔）",
					parseModeOptions: {
						divider: "分隔符模式（简易）",
					},
				},
				dividerConfig: {
					title: "批量解析分隔符",
					regex: "正面/背面分隔符",
					regexDesc: "用于分隔卡片正面和背面内容的符号（默认：---div---）",
					marker: "挖空标记",
					markerDesc: "标记挖空内容的符号（默认：==）",
					cardSeparator: "卡片分隔符",
					cardSeparatorDesc: "在批量解析中分隔不同卡片的符号（默认：<->）",
				},
				systemExcludeTags: {
					label: "文件级别排除标签",
					value: "#we_已删除, #we_deleted",
					desc: "系统自动过滤带有这些标签的卡片文件（官方设置，不可修改）",
				},
				excludeTags: {
					title: "排除标签配置",
					label: "用户自定义排除标签",
					desc: "包含这些标签的卡片将被跳过（多个标签用逗号分隔，自动识别 # 符号）",
					placeholder: "skip",
				},
				fileMappings: {
					title: "文件夹牌组映射",
					folderDeckMapping: "Folder-Deck Mapping",
					desc: "配置文件夹到牌组的自动映射关系",
					addMapping: "添加映射",
				},
			},
			actions: {
				save: "保存",
				saved: "设置已保存",
				saveFailed: "保存设置失败",
				reset: "重置",
				cancel: "取消",
				confirm: "确认",
				close: "关闭",
			},
		},
	},
	'en-US': {

		settings: {
			title: "Settings",
			categories: {
				basic: "Basic",
				memoryLearning: "Memory Learning",
				fsrs6: "FSRS6 Algorithm",
				cardParsing: "Batch Parsing",
				aiConfig: "AI Card Creation",
				incrementalReading: "Incremental Reading",
				virtualization: "Performance",
				dataManagement: "Backup & Maintenance",
				ankiConnect: "Anki Config",
				pluginSystem: "Plugins",
				about: "About",
			},
			basic: {
				title: "Basic Settings",
				language: {
					label: "Language",
					chinese: "简体中文",
					english: "English",
					description: "Select interface language",
				},
				defaultDeck: {
					label: "Default Deck",
					placeholder: "Enter default deck name",
					description: "New cards will be added to this deck by default",
				},
				notifications: {
					label: "Enable Notifications",
					description: "Show study reminders and system notifications",
				},
				floatingButton: {
					label: "Show Floating Create Button",
					description: "Display quick create button at bottom-right corner",
				},
				shortcuts: {
					label: "Enable Keyboard Shortcuts",
					description: "Keyboard shortcuts for study mode (1-4 for rating, Space to show answer)",
				},
				debugMode: {
					label: "Debug Mode",
					description: "Output detailed debug logs to browser console",
					enabled: "Debug mode enabled, detailed logs will be shown in console",
					disabled: "Debug mode disabled",
				},
				showPerformanceSettings: {
					label: "Performance Settings",
					description: "Show or hide performance optimization settings",
					shownMessage: "Performance settings displayed",
					hiddenMessage: "Performance settings hidden",
				},
				deckCardStyle: {
					label: "Deck Card Style",
					description: "Choose the visual style for deck cards in the study interface",
					options: {
						default: "Default Style",
						chineseElegant: "Elegant Style",
					},
					updateMessage: "Deck card style updated",
				},
				progressiveCloze: {
					title: "Progressive Cloze",
					historyInheritance: {
						label: "History Inheritance",
						description:
							"How to handle existing learning history when converting to progressive cloze",
						first: "First sub-cloze inherits (Recommended)",
						proportional: "All sub-clozes inherit proportionally",
						reset: "Reset all to new cards",
						prompt: "Prompt me each time",
					},
					updateMessage: "Progressive cloze history inheritance strategy updated",
				},
			},
			editor: {
				title: "Editor Settings",
				description: "Configure card editor and link format",
				editorMode: {
					label: "Editor Mode",
					markdownMode: "Markdown Mode",
					description: "Use unified Markdown format for card editing",
				},
				linkStyle: {
					label: "Link Style",
				},
				linkPath: {
					label: "Link Path",
				},
				preferAlias: {
					label: "Prefer Alias",
				},
				attachmentDir: {
					label: "Attachment Directory",
				},
				embedImages: {
					label: "Auto Embed Images",
				},
				linkPathDisplay: {
					short: "Short",
					relative: "Relative",
					absolute: "Absolute",
				},
				window: {
					title: "Editor Window Settings",
					enableResize: {
						label: "Enable Drag to Resize",
						description: "Allow resizing editor window by dragging borders",
					},
					windowSize: {
						label: "Window Size",
						description: "Default size for editor window",
					},
					rememberSize: {
						label: "Remember Last Size",
						description: "Restore previous window size on next open",
					},
					sizePresets: {
						small: "Small",
						medium: "Medium",
						large: "Large",
						fullscreen: "Fullscreen",
						custom: "Custom",
					},
				},
			},
			learning: {
				title: "Learning Settings",
				reviewsPerDay: {
					label: "Reviews Per Day",
					description: "Maximum number of cards to review per day",
				},
				newCardsPerDay: {
					label: "New Cards Per Day",
					description: "Maximum number of new cards to learn per day",
				},
				learningSteps: {
					label: "Learning Steps (minutes)",
					description: "Separate multiple intervals with commas",
					placeholder: "1, 10",
				},
				graduatingInterval: {
					label: "Graduating Interval (days)",
					description: "Initial review interval after graduating from learning",
					placeholder: "1",
				},
				autoAdvance: {
					label: "Auto Advance",
					description: "Automatically show next card after rating",
					delay: "Delay (seconds)",
				},
			},
			siblingDispersion: {
				title: "Intelligent Sibling Dispersion",
				saved: "Sibling dispersion settings saved",
				saveFailed: "Failed to save, please try again",
				enabledNotice: "Intelligent sibling dispersion enabled",
				resetToDefaults: "Reset to recommended configuration",
				whatIs: "What is Sibling Dispersion?",
				description:
					"Progressive cloze creates multiple child cards (siblings) for one card. To avoid memory interference, these sibling cards should not appear on similar dates.",
				benefit:
					"When enabled, it improves learning effectiveness by reducing proactive and retroactive interference, based on cognitive science research and Anki best practices.",
				enable: {
					label: "Enable Intelligent Dispersion",
					description:
						"Automatically manage sibling card study dates to avoid appearing in the same study session or on similar dates",
				},
				parameters: {
					title: "Core Parameters",
				},
				minSpacing: {
					label: "Minimum Spacing (Days)",
					description: "Minimum time interval between sibling cards (Recommended: 5 days)",
				},
				spacingPercentage: {
					label: "Dynamic Spacing Percentage",
					description: "Dynamic adjustment ratio based on review interval (Recommended: 5%)",
					hint: "Actual interval = max(min spacing, review interval × this ratio)",
				},
				example: {
					title: "Dispersion Effect Examples",
				},
				features: {
					title: "Feature Toggles",
				},
				filterInQueue: {
					label: "Filter in Queue Generation",
					description:
						"Prevent sibling cards from appearing in the same study session (Immediate effect)",
					recommendation: "Highly recommended",
				},
				autoAdjustAfterReview: {
					label: "Dynamic Adjustment After Review",
					description: "Automatically adjust conflicting sibling card due dates after review",
					recommendation: "Recommended for continuous optimization",
				},
				respectFuzzRange: {
					label: "Respect FSRS Fuzz Range",
					description: "Adjust only within FSRS fuzz range, preserving optimal review intervals",
					recommendation: "Must enable for scientific accuracy",
				},
				resetButton: "Reset to Recommended Configuration",
				resetHint: "Based on Anki community standards and CleverDeck best practices",
				science: {
					title: "Scientific Basis",
					interference: {
						title: "Memory Interference Theory",
						proactive: "Proactive Interference",
						proactiveDesc: "Previously learned content interferes with new learning",
						retroactive: "Retroactive Interference",
						retroactiveDesc: "Newly learned content interferes with previous memory",
						consolidation: "Memory Consolidation",
						consolidationDesc:
							"New memories need time to consolidate; learning similar content consecutively reduces effectiveness",
					},
					references: {
						title: "Reference Standards",
					},
					benefits: {
						title: "Expected Benefits",
						retention: "Improve long-term retention",
						interference: "Reduce memory interference",
						efficiency: "Enhance learning efficiency",
						fsrs: "Perfect compatibility with FSRS algorithm",
					},
				},
			},
			navigation: {
				title: "Navigation Visibility",
				description: "Control the display of main interface navigation items",
			},
			cardParsing: {
				title: "Batch Parsing Configuration",
				premiumPrompt:
					"Batch parsing allows you to process multiple files or folders at once. Upgrade to premium to unlock this feature.",
				regexManagement: {
					title: "Regex Pattern Management",
					addMapping: "Add Mapping",
					presets: {
						defaultMode: "Default Mode (New Users)",
						qaMode: "Q&A Mode",
						standardDivider: "Standard Divider Mode",
						basicMode: "Basic Mode",
						ankiExport: "Anki Export Mode",
					},
					tableHeaders: {
						type: "Type",
						path: "Path",
						filePrefix: "File Prefix",
						regexPattern: "Regex Pattern",
						targetDeck: "Target Deck",
						subfolders: "Subfolders",
						outerCover: "Outer Cover",
						enabled: "Enabled",
						actions: "Actions",
					},
					actions: {
						enable: "Enable",
						delete: "Delete",
						edit: "Edit",
					},
				},
				preset: {
					title: "Edit Regex Preset",
					presetName: "Preset Name",
					parseMode: "Parse Mode",
					cardSeparation: "Card Separation Method",
					useCustomSeparator: "Use Custom Separator",
					useLineSeparator: "Use Line Separator",
					cardSeparator: "Card Separator",
					frontBackSeparator: "Front/Back Separator",
					syncMethod: "Sync Method",
					excludeTags: "Exclude Tags (comma-separated)",
					parseModeOptions: {
						divider: "Divider Mode (Simple)",
					},
				},
				dividerConfig: {
					title: "Batch Parsing Delimiters",
					regex: "Front/Back Delimiter",
					regexDesc: "Symbol to separate front and back content of cards (default: ---div---)",
					marker: "Cloze Marker",
					markerDesc: "Symbol to mark cloze content (default: == ==)",
					cardSeparator: "Card Separator",
					cardSeparatorDesc:
						"Symbol to separate different cards in batch parsing (default: %%<->%%)",
				},
				systemExcludeTags: {
					label: "File-level Exclude Tags",
					value: "#we_已删除, #we_deleted",
					desc: "System automatically filters card files with these tags (Official setting, read-only)",
				},
				excludeTags: {
					title: "Exclude Tags Configuration",
					label: "User-defined Exclude Tags",
					desc: "Cards with these tags will be skipped (separate with commas, # symbol auto-handled)",
					placeholder: "skip",
				},
				fileMappings: {
					title: "Folder-Deck Mapping",
					folderDeckMapping: "Folder-Deck Mapping",
					desc: "Configure automatic mapping between folders and decks",
					addMapping: "Add Mapping",
				},
			},
			actions: {
				save: "Save",
				saved: "Settings saved",
				saveFailed: "Failed to save settings",
				reset: "Reset",
				cancel: "Cancel",
				confirm: "Confirm",
				close: "Close",
			},
		},
	},
};

export const settingsTranslationOverrides: Record<SupportedLanguage, TranslationKey> = {
	'zh-CN': {
		settings: {
			basic: {
				debugMode: {
					label: "启用调试模式",
				},
				deckCardStyle: {
					label: "牌组卡片样式",
					options: {
						chineseElegant: "国风雅致",
						default: "默认",
					},
				},
				defaultDeck: {
					label: "默认牌组",
					placeholder: "输入默认打开的牌组名称",
				},
				floatingButton: {
					label: "显示悬浮新建按钮",
				},
				mainInterfaceOpenLocation: {
					content: "主区域",
					label: "主界面默认打开位置",
					sidebar: "侧边栏",
				},
				premiumFeaturesPreview: {
					label: "显示高级功能预览",
				},
				progressiveCloze: {
					historyInheritance: {
						first: "继承第一张卡的历史",
						label: "渐进填空历史继承",
						prompt: "每次询问",
						proportional: "按比例继承历史",
						reset: "重置历史",
					},
				},
				showPerformanceSettings: {
					label: "显示性能优化设置",
				},
				studyViewSpacing: {
					comfortable: "宽松",
					compact: "紧凑",
					default: "标准",
					label: "学习界面间距",
				},
				title: "基础设置",
			},
			memoryLearning: {
				clozeDelimiters: {
					currentSyntax: "当前识别语法：{syntax}",
					helpText: "仅支持一组当前生效的成对包裹符号。修改后，普通挖空题只按当前符号识别。",
					label: "挖空符号",
				},
				learningSteps: {
					helpText: "用空格分隔每个步骤的分钟数，例如：1 10。留空则由 FSRS6 接管新卡短期调度。",
					label: "学习步骤",
				},
				relearningSteps: {
					helpText: "复习卡点“重来”后的重学步骤，例如：10。留空则由 FSRS6 接管重学调度。",
					label: "重学步骤",
				},
				shortTermScheduling: {
					label: "短期调度预设",
					recommended: "推荐混合模式",
					pureFsrs: "纯 FSRS6 模式",
					status: {
						recommended:
							"当前：推荐混合模式。保留少量当日重学步骤，长间隔交给 FSRS6，通常是记忆效果和体验最平衡的方案。",
						pureFsrs: "当前：纯 FSRS6 模式。FSRS6 接管全部短期调度，间隔会更激进，也更实验性。",
						custom: "当前：自定义模式。你手动修改了学习步骤配置。",
					},
				},
				fsrsShortTermNote:
					"说明：记忆牌组使用 FSRS6。推荐混合模式遵循 Anki 官方“少量、短于 1 天的学习步骤”建议，同时让长期与毕业后的间隔完全交给 FSRS6 计算。",
				maxAdvanceDays: {
					label: "最远提前学习天数",
					unit: "天",
				},
				studyExperience: {
					title: "学习体验",
				},
			},
		},
		settingsConstants: {
			acknowledgments: {
				anki: {
					description: "间隔重复学习工具的代表产品，为插件的学习体验提供了重要参考。",
					name: "Anki",
				},
				fsrs: {
					description: "现代间隔重复算法的重要实现，为插件中的记忆调度与参数优化提供了关键参考。",
					name: "fsrs6",
				},
				obsidian: {
					description: "感谢 Obsidian 提供开放而灵活的平台基础，让插件可以服务于全平台知识工作流。",
					name: "Obsidian",
				},
				samdagreatwzzz: {
					description:
						"插件 AI 制卡功能的早期灵感借鉴来源，早期 AI 制卡方案参考了他的 AI 制卡思路。",
					name: "SamDaGreatWzzz",
				},
				supporters: {
					description: "感谢付费支持插件的朋友，让长期维护、高级功能打磨与持续迭代成为可能。",
					name: "感谢付费支持插件的朋友",
				},
				users: {
					description: "感谢每一位使用插件、反馈问题、提出建议的朋友，你们是产品持续成长的动力。",
					name: "感谢使用插件的朋友",
				},
			},
			aiProviderLabels: {
				siliconflow: "硅基流动",
				zhipu: "智谱 AI",
			},
			aiKeyPlaceholder: {
				zhipu: "填写你的智谱 API Key",
			},
			aiProviderDesc: {
				anthropic: "Anthropic Claude，长文理解和稳健输出表现突出。",
				deepseek: "DeepSeek，性价比较高，适合日常生成与推理场景。",
				gemini: "Google Gemini，适合长上下文理解与多模态任务。",
				openai: "OpenAI 官方 API，模型生态完整，适合通用生成与格式优化。",
				siliconflow: "硅基流动，聚合多种模型，接入方式灵活。",
				xai: "xAI Grok，适合开放式问答与实时风格场景。",
				zhipu: "智谱 AI，国内可用性较好，适合中文场景。",
			},
			modalSize: {
				custom: "自定义",
				extraLarge: "超大",
				large: "大",
				medium: "中",
				small: "小",
			},
		},
		settingsUtils: {
			licenseStatus: {
				active: "已激活",
				expired: "已过期",
				expiringIn: "{days} 天后到期",
				inactive: "未激活",
			},
			operationFailed: "操作失败",
			validation: {
				codeEmpty: "激活码不能为空",
				codeIncomplete: "激活码长度可能还不完整",
				codeInvalidChars: "激活码包含无效字符",
				codeTooShort: "激活码长度过短，至少建议 {min} 个字符",
			},
		},
	},
	'en-US': {
		settings: {
			basic: {
				debugMode: {
					label: "Enable debug mode",
				},
				deckCardStyle: {
					label: "Deck card style",
					options: {
						chineseElegant: "Chinese Elegant",
						default: "Default",
					},
				},
				defaultDeck: {
					label: "Default deck",
					placeholder: "Enter the default deck name",
				},
				floatingButton: {
					label: "Show floating create button",
				},
				mainInterfaceOpenLocation: {
					content: "Main area",
					label: "Default place to open the main interface",
					sidebar: "Sidebar",
				},
				premiumFeaturesPreview: {
					label: "Show premium feature preview",
				},
				progressiveCloze: {
					historyInheritance: {
						first: "Inherit from first card",
						label: "Progressive cloze history inheritance",
						prompt: "Ask every time",
						proportional: "Inherit proportionally",
						reset: "Reset history",
					},
				},
				showPerformanceSettings: {
					label: "Show performance settings",
				},
				studyViewSpacing: {
					comfortable: "Comfortable",
					compact: "Compact",
					default: "Default",
					label: "Study view spacing",
				},
				title: "Basic settings",
			},
			memoryLearning: {
				clozeDelimiters: {
					currentSyntax: "Current recognized syntax: {syntax}",
					helpText: "Only one active pair of wrapping delimiters is supported at a time. After changing it, standard cloze cards are recognized only by the current delimiters.",
					label: "Cloze delimiters",
				},
				learningSteps: {
					helpText:
						"Use spaces to separate each step in minutes, for example: 1 10. Leave blank to let FSRS6 handle new-card short-term scheduling.",
					label: "Learning steps",
				},
				relearningSteps: {
					helpText:
						"Relearning steps after pressing Again on a review card, for example: 10. Leave blank to let FSRS6 handle relearning scheduling.",
					label: "Relearning steps",
				},
				shortTermScheduling: {
					label: "Short-term scheduling preset",
					recommended: "Recommended hybrid",
					pureFsrs: "Pure FSRS6",
					status: {
						recommended:
							"Current: recommended hybrid. Keep a few same-day relearning steps, but hand long intervals to FSRS6. This is usually the best balance between retention and study feel.",
						pureFsrs:
							"Current: pure FSRS6. FSRS6 handles all short-term scheduling, which is more aggressive and more experimental.",
						custom: "Current: custom. You manually changed the learning-step configuration.",
					},
				},
				fsrsShortTermNote:
					"Note: memory decks use FSRS6. The recommended hybrid mode follows Anki’s guidance to keep (re)learning steps few and under 1 day, while letting FSRS6 fully control long-term intervals after graduation.",
				maxAdvanceDays: {
					label: "Max advance-study days",
					unit: "days",
				},
				studyExperience: {
					title: "Study experience",
				},
			},
		},
		settingsConstants: {
			acknowledgments: {
				anki: {
					description:
						"A landmark spaced-repetition app that strongly influenced the plugin’s learning experience.",
					name: "Anki",
				},
				fsrs: {
					description:
						"A modern spaced-repetition implementation that informed the plugin’s scheduling and optimization design.",
					name: "fsrs6",
				},
				obsidian: {
					description:
						"Thanks to Obsidian for the open and flexible platform foundation that makes this cross-platform learning workflow possible.",
					name: "Obsidian",
				},
				samdagreatwzzz: {
					description:
						"An early inspiration source for the plugin’s AI card creation, and the initial AI card-making workflow referenced his approach.",
					name: "SamDaGreatWzzz",
				},
				supporters: {
					description:
						"Thanks to everyone who financially supports the plugin and makes long-term maintenance and premium feature development possible.",
					name: "Thanks to Premium Supporters",
				},
				users: {
					description:
						"Thanks to everyone who uses the plugin, shares feedback, and helps shape each iteration.",
					name: "Thanks to Plugin Users",
				},
			},
			aiProviderLabels: {
				siliconflow: "SiliconFlow",
				zhipu: "Zhipu AI",
			},
			aiKeyPlaceholder: {
				zhipu: "Enter your Zhipu API key",
			},
			aiProviderDesc: {
				anthropic:
					"Anthropic Claude, especially strong at long-form understanding and stable outputs.",
				deepseek: "Cost-effective for everyday generation and reasoning tasks.",
				gemini: "Google Gemini, strong for long-context understanding and multimodal tasks.",
				openai:
					"Official OpenAI API with a mature model lineup for general generation and formatting.",
				siliconflow: "Aggregates multiple models with flexible access options.",
				xai: "xAI Grok, suitable for open-ended Q&A and a lively response style.",
				zhipu: "Good availability for Chinese-language workflows and local access.",
			},
			modalSize: {
				custom: "Custom",
				extraLarge: "Extra large",
				large: "Large",
				medium: "Medium",
				small: "Small",
			},
		},
		settingsUtils: {
			licenseStatus: {
				active: "Active",
				expired: "Expired",
				expiringIn: "Expires in {days} days",
				inactive: "Inactive",
			},
			operationFailed: "Operation failed",
			validation: {
				codeEmpty: "Activation code cannot be empty",
				codeIncomplete: "The activation code may still be incomplete",
				codeInvalidChars: "The activation code contains invalid characters",
				codeTooShort: "The activation code is too short; at least {min} characters are recommended",
			},
		},
	},
};
