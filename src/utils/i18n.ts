/**
 * 国际化系统
 * 提供多语言支持和文本本地化功能
 */

import { writable, derived } from 'svelte/store';

// ============================================================================
// 类型定义
// ============================================================================

export type SupportedLanguage = 'zh-CN' | 'en-US';

export interface TranslationKey {
  [key: string]: string | TranslationKey;
}

export interface I18nConfig {
  defaultLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
}

// ============================================================================
// 翻译资源
// ============================================================================

const translations: Record<SupportedLanguage, TranslationKey> = {
  'zh-CN': {
    analytics: {
      dashboard: {
        title: '统计分析',
        loading: '正在加载数据...',
        error: '数据加载失败',
        retry: '重试',
        refresh: '刷新',
        noData: '暂无数据',
        
        // KPI 卡片
        kpi: {
          todayReviews: '今日复习',
          todayNew: '今日新增',
          accuracy: '正确率',
          studyTime: '学习时长',
          memoryRate: '记忆率',
          streakDays: '连续天数',
          fsrsProgress: 'FSRS进度',
          
          // 趋势描述
          trend: {
            up: '上升',
            down: '下降',
            stable: '稳定',
            yesterdayCompare: '较昨日',
            newCardsAdded: '新卡片加入'
          }
        },
        
        // 图表标题
        charts: {
          reviewTrend: '复习趋势（{days}天）',
          ratingDistribution: '评分分布',
          calendarHeatmap: '热力图（日历）',
          timeHeatmap: '时段热力（24h×7）',
          intervalGrowth: '间隔增长（周均 scheduledDays）',
          deckComparison: '牌组对比'
        },
        
        // 表格标题
        table: {
          deck: '牌组',
          reviews: '复习量',
          accuracy: '正确率',
          avgInterval: '平均间隔',
          avgDifficulty: '平均难度'
        },
        
        // FSRS 分析
        fsrs: {
          title: 'FSRS6 算法分析',
          avgDifficulty: '平均难度',
          avgStability: '平均稳定性',
          difficultyScore: 'FSRS难度评分',
          stabilityDays: '天数',
          retentionRate: '记忆保持率',
          learningEfficiency: '学习效率'
        }
      },
      
      // 时间范围
      timeRange: {
        last7Days: '最近7天',
        last30Days: '最近30天',
        last90Days: '最近90天',
        thisMonth: '本月',
        lastMonth: '上月',
        thisYear: '今年',
        custom: '自定义'
      },
      
      // 错误消息
      errors: {
        loadFailed: '数据加载失败',
        networkError: '网络连接错误',
        dataCorrupted: '数据损坏',
        insufficientData: '数据不足',
        calculationError: '计算错误'
      }
    },
    
    settings: {
      title: '设置',
      categories: {
        basic: '基础',
        fsrs6: 'FSRS6算法',
        annotation: '标注同步',
        cardParsing: '卡片解析',
        aiConfig: 'AI制卡',
        virtualization: '性能优化',
        dataManagement: '数据管理',
        ankiConnect: 'Anki同步',
        about: '关于'
      },
      basic: {
        title: '基础设置',
        language: {
          label: '语言',
          chinese: '简体中文',
          english: 'English',
          description: '选择界面显示语言'
        },
        defaultDeck: {
          label: '默认牌组',
          placeholder: '输入默认牌组名称',
          description: '新卡片默认添加到此牌组'
        },
        notifications: {
          label: '启用通知',
          description: '显示学习提醒和系统通知'
        },
        floatingButton: {
          label: '显示悬浮新建按钮',
          description: '在界面右下角显示快速新建按钮'
        },
        shortcuts: {
          label: '启用键盘快捷键',
          description: '学习模式的键盘快捷键（1-4评分，空格显示答案）'
        },
        debugMode: {
          label: '调试模式',
          description: '启用后将在浏览器控制台输出详细的调试日志信息',
          enabled: '调试模式已启用，控制台将输出详细日志',
          disabled: '调试模式已关闭'
        }
      },
      editor: {
        title: '编辑器窗口设置',
        enableResize: {
          label: '启用拖拽调整',
          description: '允许通过拖拽边框调整编辑窗口尺寸'
        },
        windowSize: {
          label: '窗口尺寸',
          description: '选择编辑窗口的默认大小'
        },
        rememberSize: {
          label: '记住上次尺寸',
          description: '下次打开时恢复上次的窗口大小'
        },
        sizePresets: {
          small: '小',
          medium: '中',
          large: '大',
          fullscreen: '全屏',
          custom: '自定义'
        }
      },
      learning: {
        title: '学习设置',
        reviewsPerDay: {
          label: '每日复习数量',
          description: '每天计划复习的卡片数量上限'
        },
        newCardsPerDay: {
          label: '每日新卡片数量',
          description: '每天学习的新卡片数量上限'
        },
        autoAdvance: {
          label: '自动前进',
          description: '评分后自动显示下一张卡片',
          delay: '延迟（秒）'
        }
      },
      navigation: {
        title: '导航可见性',
        description: '控制主界面导航项的显示'
      },
      actions: {
        save: '保存',
        saved: '设置已保存',
        saveFailed: '保存设置失败',
        reset: '重置',
        cancel: '取消',
        confirm: '确认',
        close: '关闭'
      }
    },
    
    common: {
      loading: '加载中...',
      error: '错误',
      success: '成功',
      warning: '警告',
      info: '信息',
      confirm: '确认',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      edit: '编辑',
      close: '关闭',
      retry: '重试',
      refresh: '刷新',
      reset: '重置',
      clear: '清空',
      search: '搜索',
      filter: '筛选',
      sort: '排序',
      export: '导出',
      import: '导入',
      settings: '设置',
      help: '帮助',
      about: '关于',
      time: {
        seconds: '{count} 秒',
        minutes: '{count} 分钟',
        hours: '{count} 小时',
        days: '{count} 天',
        manual: '手动'
      },
      count: {
        items: '{count} 项',
        selected: '已选择 {count} 项'
      },
      validation: {
        required: '此字段为必填项',
        invalid: '输入无效'
      }
    },
    
    // 🌍 新增：主导航翻译
    navigation: {
      deckStudy: '牌组学习',
      cardManagement: '卡片管理',
      aiAssistant: 'AI助手',
      analytics: '统计分析',
      switchView: '切换视图',
      createDeck: '新建牌组',
      moreActions: '更多操作'
    },
    
    // 🌍 庆祝界面
    celebration: {
      title: '恭喜！今日学习完成！',
      subtitle: '你已经完成了「{deckName}」的所有学习任务',
      stats: {
        cardsStudied: '学习卡片',
        timeSpent: '学习时长',
        accuracy: '正确率'
      },
      footer: {
        hint: '💫 可以继续学习其他牌组哦~',
        closeButton: '知道了'
      },
      timeFormat: {
        lessThan1Min: '< 1分钟',
        minutes: '{n}分钟',
        hoursMinutes: '{h}小时{m}分钟'
      }
    },
    
    // 🌍 通知消息
    notifications: {
      success: {
        cardSaved: '卡片已保存',
        cardDeleted: '卡片已删除',
        deckCreated: '牌组已创建',
        settingsUpdated: '设置已更新',
        syncCompleted: '同步完成',
        exportSuccess: '导出成功',
        importSuccess: '导入成功',
        backupCreated: '备份已创建',
        optimizationComplete: '参数优化完成'
      },
      error: {
        saveFailed: '保存失败',
        loadFailed: '加载失败',
        deleteFailed: '删除失败',
        syncFailed: '同步失败',
        connectionFailed: '连接失败',
        exportFailed: '导出失败',
        importFailed: '导入失败',
        validationFailed: '验证失败',
        unknownError: '发生未知错误'
      },
      warning: {
        unsavedChanges: '有未保存的更改',
        licenseExpiring: '许可证即将过期',
        licenseExpired: '许可证已过期',
        backupFailed: '备份失败',
        syncConflict: '同步冲突'
      },
      info: {
        loading: '加载中...',
        syncing: '同步中...',
        processing: '处理中...',
        generating: 'AI生成中...',
        optimizing: '优化中...'
      }
    },
    
    // 🌍 菜单和工具提示
    menus: {
      context: {
        edit: '编辑',
        delete: '删除',
        duplicate: '复制',
        copy: '复制内容',
        moveTo: '移动到',
        addTags: '添加标签',
        removeTags: '移除标签',
        suspend: '暂停',
        unsuspend: '恢复',
        bury: '埋藏',
        unbury: '取消埋藏',
        flag: '标记',
        unflag: '取消标记'
      },
      tooltips: {
        clickToEdit: '点击编辑',
        doubleClickToView: '双击查看详情',
        dragToSort: '拖拽排序',
        rightClickForMore: '右键查看更多选项'
      }
    },
    
    // 🌍 学习界面
    studyInterface: {
      showAnswer: '显示答案',
      confirmAnswer: '确认答案',
      ratings: {
        again: '重来',
        hard: '困难',
        good: '良好',
        easy: '简单'
      },
      intervals: {
        unknown: '未知',
        lessThan1Min: '< 1分钟',
        minutes: '{n}分钟',
        hours: '{n}小时',
        days: '{n}天',
        months: '{n}个月',
        years: '{n}年'
      },
      progress: {
        ariaLabel: '学习进度',
        newCards: '新卡片 {n} 张',
        learning: '学习中 {n} 张',
        review: '待复习 {n} 张',
        mastered: '已掌握 {n} 张',
        total: '总计 {n} 张卡片'
      },
      actions: {
        return: '返回',
        regenerate: '重新生成',
        collect: '收入 ({n})',
        undo: '撤销'
      }
    },
    
    // 🌍 FSRS算法设置
    fsrs: {
      title: 'FSRS6算法设置',
      description: '配置间隔重复学习算法参数',
      savedMessage: 'FSRS6设置已保存',
      saveFailed: '保存设置失败',
      basicParams: {
        title: '基础参数',
        retention: {
          label: '目标记忆率',
          description: '期望的长期记忆保持率（0.5-0.99）'
        },
        maxInterval: {
          label: '最大间隔',
          description: '卡片复习的最大间隔天数'
        },
        enableFuzz: {
          label: '启用随机化',
          description: '在计算的间隔基础上添加随机波动'
        }
      },
      advancedSettings: {
        title: '高级设置',
        weights: {
          title: '权重参数',
          description: 'FSRS6算法的21个权重参数，影响记忆预测的准确性',
          allowEdit: '允许编辑',
          locked: '权重参数已锁定，启用"允许编辑"开关以修改参数',
          warning: '⚠️ 修改权重参数可能影响学习效果，请谨慎操作',
          reset: '重置默认'
        }
      },
      optimization: {
        title: '智能优化',
        description: '基于您的学习数据自动调优FSRS6参数',
        dataPoints: '数据点数量',
        accuracy: '预测准确性',
        status: '优化状态',
        statusReady: '就绪',
        statusOptimizing: '优化中...',
        startButton: '开始优化',
        optimizingButton: '优化中...',
        complete: '参数优化完成',
        failed: '参数优化失败'
      },
      performance: {
        title: '性能监控',
        description: '实时监控FSRS6算法的运行状态和性能指标',
        refresh: '刷新',
        algorithmVersion: '算法版本',
        executionTime: '执行时间',
        cacheHitRate: '缓存命中率',
        activeInstances: '活跃实例',
        noData: '点击刷新按钮获取性能指标'
      },
      parameters: {
        title: '算法参数',
        targetRetention: {
          label: '目标记忆率',
          description: '期望的长期记忆保持率（0.5-0.99）',
          placeholder: '例如：0.9表示90%记忆率'
        },
        maxInterval: {
          label: '最大间隔',
          description: '两次复习之间的最长天数',
          unit: '天'
        }
      },
      optimization: {
        title: '参数优化',
        optimize: '优化参数',
        optimizing: '优化中...',
        optimizeDescription: '基于您的学习数据优化算法参数',
        lastOptimized: '上次优化'
      },
      actions: {
        reset: '重置为默认值',
        import: '导入参数',
        export: '导出参数',
        save: '保存参数',
        cancel: '取消'
      }
    },
    
    // 🌍 标注同步设置
    annotation: {
      title: 'Tuanki 标注系统',
      description: '基于文档标注快速创建卡片，提高制卡效率',
      requireLicense: '此功能需要激活许可证后使用',
      features: {
        title: '激活后您将获得',
        feature1: '📝 文档内标注制卡',
        feature2: '🎯 智能批量生成卡片',
        feature3: '🔄 双向同步更新',
        feature4: '⚡ 高效学习工作流',
        feature5: '🎨 自定义标注样式'
      },
      activateButton: '前往激活',
      settings: {
        saved: '设置已保存',
        failed: '设置保存失败，请重试'
      },
      sync: {
        title: '同步选项',
        autoSync: {
          label: '自动同步',
          description: '自动监控文件变化并同步到卡片'
        },
        syncInterval: {
          label: '同步间隔',
          description: '检查文件变化的时间间隔',
          unit: '秒'
        },
        twoWaySync: {
          label: '双向同步',
          description: '卡片内容更改时同步回标注块'
        },
        syncOnlyActive: {
          label: '仅同步活动文件',
          description: '只同步当前打开的文件，减少性能影响'
        }
      },
      monitoring: {
        title: '文件监控',
        detectDelay: {
          label: '检测延迟',
          description: '文件变化后等待时间，避免频繁触发',
          unit: '毫秒'
        }
      },
      advanced: {
        title: '高级选项',
        maxConcurrent: {
          label: '最大并发处理数',
          description: '同时处理的文件数量'
        },
        autoCreateDeck: {
          label: '自动创建牌组',
          description: '根据文件路径自动创建对应的牌组'
        }
      }
    },
    
    // 🌍 卡片解析设置
    parsing: {
      title: '卡片解析设置',
      description: '配置Markdown文件的卡片批量解析规则',
      batchParsing: {
        title: '批量解析',
        enable: {
          label: '启用批量解析',
          description: '扫描文件中的卡片标记并批量创建'
        },
        markers: {
          title: '解析标记',
          startMarker: {
            label: '开始标记',
            description: '批量解析的起始标记',
            default: '---start---'
          },
          endMarker: {
            label: '结束标记',
            description: '批量解析的结束标记',
            default: '---end---'
          }
        }
      },
      cloze: {
        title: '挖空语法',
        defaultSyntax: {
          label: '默认语法',
          markdown: 'Markdown高亮（==文本==）',
          anki: 'Anki格式（{{c1::文本}}）'
        },
        autoDetect: {
          label: '自动检测',
          description: '自动检测并支持两种语法'
        }
      }
    },
    
    // 🌍 AI制卡配置
    aiConfig: {
      title: 'AI制卡配置',
      description: '配置AI辅助创建卡片的功能',
      providers: {
        title: 'AI提供商',
        openai: 'OpenAI',
        gemini: 'Google Gemini',
        anthropic: 'Anthropic Claude',
        deepseek: 'DeepSeek',
        zhipu: '智谱清言',
        siliconflow: '硅基流动',
        select: '选择提供商'
      },
      apiKeys: {
        title: 'API密钥管理',
        add: '添加密钥',
        edit: '编辑密钥',
        delete: '删除密钥',
        verify: '验证密钥',
        verifying: '验证中...',
        verified: '已验证',
        invalid: '无效',
        notSet: '未设置',
        placeholder: '输入API密钥'
      },
      models: {
        title: '模型选择',
        select: '选择模型',
        recommended: '推荐'
      }
    },
    
    // 🌍 数据管理
    dataManagement: {
      title: '数据管理',
      description: '管理插件数据的导入、导出和备份',
      importExport: {
        title: '导入导出',
        import: {
          title: '导入数据',
          button: '导入',
          selectFile: '选择文件',
          importing: '导入中...',
          success: '导入成功',
          failed: '导入失败'
        },
        export: {
          title: '导出数据',
          button: '导出',
          exporting: '导出中...',
          success: '导出成功',
          failed: '导出失败'
        }
      },
      backup: {
        title: '数据备份',
        auto: {
          title: '自动备份',
          enable: '启用自动备份'
        },
        manual: {
          title: '手动备份',
          create: '立即备份',
          creating: '备份中...',
          success: '备份成功',
          failed: '备份失败'
        }
      }
    },
    
    // 🌍 AnkiConnect同步
    ankiConnect: {
      title: 'Anki同步设置',
      description: '配置与Anki桌面应用的同步',
      connection: {
        title: '连接配置',
        address: {
          label: '服务器地址',
          placeholder: 'http://localhost'
        },
        port: {
          label: '端口',
          placeholder: '8765'
        },
        test: {
          button: '测试连接',
          testing: '测试中...',
          success: '连接成功',
          failed: '连接失败'
        }
      },
      status: {
        title: '连接状态',
        connected: '已连接',
        disconnected: '未连接',
        syncing: '同步中...'
      }
    },
    
    // 🌍 性能优化
    virtualization: {
      title: '性能优化',
      description: '配置虚拟滚动和渲染优化，提升大量卡片时的性能表现',
      resetConfirm: '确定要重置所有虚拟化设置为默认值吗？',
      resetButton: '重置为默认',
      kanban: {
        title: '看板视图设置',
        enableVirtualScroll: {
          label: '启用虚拟滚动',
          description: '在看板列内启用虚拟滚动，大幅提升大量卡片时的性能（推荐 >200 张卡片时启用）'
        },
        enableColumnVirtualization: {
          label: '列内虚拟化',
          description: '单独对每一列启用虚拟滚动（关闭后仍可使用渐进加载）'
        },
        overscan: {
          label: '预渲染数量 (Overscan)',
          description: '视口外预渲染的卡片数量，增加可减少滚动时的白屏，但会占用更多内存'
        },
        initialBatchSize: {
          label: '初始加载数量',
          description: '每列初始加载的卡片数量（非虚拟化模式下有效）'
        },
        loadMoreBatchSize: {
          label: '批量加载数量',
          description: '点击"加载更多"时一次加载的卡片数量'
        }
      },
      table: {
        title: '表格视图设置',
        enableVirtualScroll: {
          label: '启用虚拟滚动',
          description: '在表格视图启用虚拟滚动（当前默认使用分页）'
        },
        enableTableVirtualization: {
          label: '启用表格虚拟滚动',
          description: '对表格行启用虚拟滚动（需先启用虚拟滚动）'
        },
        paginationThreshold: {
          label: '分页阈值',
          description: '少于此数量时使用分页而非虚拟滚动（推荐 500）'
        }
      },
      advanced: {
        title: '高级选项',
        cacheItemHeight: {
          label: '缓存测量高度',
          description: '缓存卡片的测量高度以提升性能（推荐开启）'
        },
        estimatedItemHeight: {
          label: '估算项目高度',
          description: '虚拟滚动的初始高度估算值（像素）'
        },
        resetSettings: {
          label: '重置设置',
          description: '将所有虚拟化设置重置为默认值'
        }
      },
      tips: {
        title: '性能优化提示',
        tip1: '虚拟滚动在卡片数量超过 200 张时自动启用，无需手动干预',
        tip2: '增加 Overscan 值可减少滚动时的白屏，但会增加内存占用',
        tip3: '表格视图推荐使用分页模式，除非需要快速浏览大量数据',
        tip4: '启用高度缓存可显著提升滚动性能，但会占用少量内存'
      }
    },
    
    // 🌍 关于页面
    about: {
      title: '关于Tuanki',
      product: {
        name: 'Tuanki - 智能记忆卡片插件',
        version: '版本',
        algorithm: '算法',
        description: '基于FSRS6算法的智能间隔重复学习系统'
      },
      license: {
        title: '许可证信息',
        status: '状态',
        type: '类型',
        activation: {
          title: '许可证激活',
          code: '激活码',
          placeholder: '输入许可证激活码',
          activate: '激活',
          activating: '激活中...'
        }
      },
      contact: {
        title: '联系方式',
        github: 'GitHub仓库',
        email: '联系邮箱',
        support: '技术支持'
      }
    }
  },
  
  'en-US': {
    analytics: {
      dashboard: {
        title: 'Analytics Dashboard',
        loading: 'Loading data...',
        error: 'Failed to load data',
        retry: 'Retry',
        refresh: 'Refresh',
        noData: 'No data available',
        
        kpi: {
          todayReviews: 'Today Reviews',
          todayNew: 'Today New',
          accuracy: 'Accuracy',
          studyTime: 'Study Time',
          memoryRate: 'Memory Rate',
          streakDays: 'Streak Days',
          fsrsProgress: 'FSRS Progress',
          
          trend: {
            up: 'Up',
            down: 'Down',
            stable: 'Stable',
            yesterdayCompare: 'vs Yesterday',
            newCardsAdded: 'New cards added'
          }
        },
        
        charts: {
          reviewTrend: 'Review Trend ({days} days)',
          ratingDistribution: 'Rating Distribution',
          calendarHeatmap: 'Calendar Heatmap',
          timeHeatmap: 'Time Heatmap (24h×7)',
          intervalGrowth: 'Interval Growth (Weekly Avg)',
          deckComparison: 'Deck Comparison'
        },
        
        table: {
          deck: 'Deck',
          reviews: 'Reviews',
          accuracy: 'Accuracy',
          avgInterval: 'Avg Interval',
          avgDifficulty: 'Avg Difficulty'
        },
        
        fsrs: {
          title: 'FSRS6 Algorithm Analysis',
          avgDifficulty: 'Avg Difficulty',
          avgStability: 'Avg Stability',
          difficultyScore: 'FSRS Difficulty Score',
          stabilityDays: 'Days',
          retentionRate: 'Retention Rate',
          learningEfficiency: 'Learning Efficiency'
        }
      },
      
      timeRange: {
        last7Days: 'Last 7 Days',
        last30Days: 'Last 30 Days',
        last90Days: 'Last 90 Days',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        thisYear: 'This Year',
        custom: 'Custom'
      },
      
      errors: {
        loadFailed: 'Failed to load data',
        networkError: 'Network connection error',
        dataCorrupted: 'Data corrupted',
        insufficientData: 'Insufficient data',
        calculationError: 'Calculation error'
      }
    },
    
    settings: {
      title: 'Settings',
      categories: {
        basic: 'Basic',
        fsrs6: 'FSRS6 Algorithm',
        annotation: 'Annotation Sync',
        cardParsing: 'Card Parsing',
        aiConfig: 'AI Card Creation',
        virtualization: 'Performance',
        dataManagement: 'Data Management',
        ankiConnect: 'Anki Sync',
        about: 'About'
      },
      basic: {
        title: 'Basic Settings',
        language: {
          label: 'Language',
          chinese: '简体中文',
          english: 'English',
          description: 'Select interface language'
        },
        defaultDeck: {
          label: 'Default Deck',
          placeholder: 'Enter default deck name',
          description: 'New cards will be added to this deck by default'
        },
        notifications: {
          label: 'Enable Notifications',
          description: 'Show study reminders and system notifications'
        },
        floatingButton: {
          label: 'Show Floating Create Button',
          description: 'Display quick create button at bottom-right corner'
        },
        shortcuts: {
          label: 'Enable Keyboard Shortcuts',
          description: 'Keyboard shortcuts for study mode (1-4 for rating, Space to show answer)'
        },
        debugMode: {
          label: 'Debug Mode',
          description: 'Output detailed debug logs to browser console',
          enabled: 'Debug mode enabled, detailed logs will be shown in console',
          disabled: 'Debug mode disabled'
        }
      },
      editor: {
        title: 'Editor Window Settings',
        enableResize: {
          label: 'Enable Drag to Resize',
          description: 'Allow resizing editor window by dragging borders'
        },
        windowSize: {
          label: 'Window Size',
          description: 'Default size for editor window'
        },
        rememberSize: {
          label: 'Remember Last Size',
          description: 'Restore previous window size on next open'
        },
        sizePresets: {
          small: 'Small',
          medium: 'Medium',
          large: 'Large',
          fullscreen: 'Fullscreen',
          custom: 'Custom'
        }
      },
      learning: {
        title: 'Learning Settings',
        reviewsPerDay: {
          label: 'Reviews Per Day',
          description: 'Maximum number of cards to review per day'
        },
        newCardsPerDay: {
          label: 'New Cards Per Day',
          description: 'Maximum number of new cards to learn per day'
        },
        autoAdvance: {
          label: 'Auto Advance',
          description: 'Automatically show next card after rating',
          delay: 'Delay (seconds)'
        }
      },
      navigation: {
        title: 'Navigation Visibility',
        description: 'Control the display of main interface navigation items'
      },
      actions: {
        save: 'Save',
        saved: 'Settings saved',
        saveFailed: 'Failed to save settings',
        reset: 'Reset',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close'
      }
    },
    
    study: {
      title: 'Study',
      session: {
        start: 'Start Study',
        pause: 'Pause',
        resume: 'Resume',
        finish: 'Finish',
        exit: 'Exit'
      },
      progress: {
        new: 'New',
        learning: 'Learning',
        review: 'Review',
        completed: 'Completed',
        remaining: 'Remaining'
      },
      rating: {
        again: 'Again',
        hard: 'Hard',
        good: 'Good',
        easy: 'Easy',
        showAnswer: 'Show Answer'
      },
      toolbar: {
        undo: 'Undo',
        skip: 'Skip',
        edit: 'Edit',
        flag: 'Flag',
        suspend: 'Suspend',
        bury: 'Bury',
        delete: 'Delete',
        info: 'Info',
        source: 'Source'
      },
      stats: {
        studyTime: 'Study Time',
        cardsReviewed: 'Cards Reviewed',
        accuracy: 'Accuracy',
        streak: 'Streak'
      }
    },
    
    cards: {
      title: 'Card Management',
      actions: {
        create: 'Create Card',
        edit: 'Edit',
        delete: 'Delete',
        duplicate: 'Duplicate',
        move: 'Move',
        export: 'Export',
        import: 'Import'
      },
      filters: {
        all: 'All',
        new: 'New',
        learning: 'Learning',
        review: 'Review',
        suspended: 'Suspended',
        buried: 'Buried'
      },
      fields: {
        front: 'Front',
        back: 'Back',
        tags: 'Tags',
        deck: 'Deck',
        created: 'Created',
        modified: 'Modified'
      }
    },
    
    decks: {
      title: 'Decks',
      actions: {
        create: 'Create Deck',
        rename: 'Rename',
        delete: 'Delete',
        export: 'Export',
        import: 'Import'
      },
      stats: {
        total: 'Total',
        new: 'New',
        learning: 'Learning',
        review: 'Review'
      }
    },
    
    modals: {
      createCard: {
        title: 'Create Card',
        selectTemplate: 'Select Template',
        selectDeck: 'Select Deck'
      },
      confirmDelete: {
        title: 'Confirm Delete',
        message: 'Are you sure you want to delete this? This action cannot be undone.',
        confirm: 'Delete',
        cancel: 'Cancel'
      }
    },
    
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      retry: 'Retry',
      refresh: 'Refresh',
      reset: 'Reset',
      clear: 'Clear',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      export: 'Export',
      import: 'Import',
      settings: 'Settings',
      help: 'Help',
      about: 'About',
      time: {
        seconds: '{count} seconds',
        minutes: '{count} minutes',
        hours: '{count} hours',
        days: '{count} days',
        manual: 'Manual'
      },
      count: {
        items: '{count} items',
        selected: '{count} selected'
      },
      validation: {
        required: 'This field is required',
        invalid: 'Invalid input'
      }
    },
    
    // 🌍 New: Main Navigation
    navigation: {
      deckStudy: 'Deck Study',
      cardManagement: 'Card Management',
      aiAssistant: 'AI Assistant',
      analytics: 'Analytics',
      switchView: 'Switch View',
      createDeck: 'Create Deck',
      moreActions: 'More Actions'
    },
    
    // 🌍 Celebration
    celebration: {
      title: 'Congratulations! Today\'s study complete!',
      subtitle: 'You\'ve finished all learning tasks for "{deckName}"',
      stats: {
        cardsStudied: 'Cards Studied',
        timeSpent: 'Time Spent',
        accuracy: 'Accuracy'
      },
      footer: {
        hint: '💫 You can continue with other decks~',
        closeButton: 'Got it'
      },
      timeFormat: {
        lessThan1Min: '< 1min',
        minutes: '{n}min',
        hoursMinutes: '{h}h {m}min'
      }
    },
    
    // 🌍 Notifications
    notifications: {
      success: {
        cardSaved: 'Card Saved',
        cardDeleted: 'Card Deleted',
        deckCreated: 'Deck Created',
        settingsUpdated: 'Settings Updated',
        syncCompleted: 'Sync Completed',
        exportSuccess: 'Export Successful',
        importSuccess: 'Import Successful',
        backupCreated: 'Backup Created',
        optimizationComplete: 'Optimization Complete'
      },
      error: {
        saveFailed: 'Save Failed',
        loadFailed: 'Load Failed',
        deleteFailed: 'Delete Failed',
        syncFailed: 'Sync Failed',
        connectionFailed: 'Connection Failed',
        exportFailed: 'Export Failed',
        importFailed: 'Import Failed',
        validationFailed: 'Validation Failed',
        unknownError: 'Unknown Error Occurred'
      },
      warning: {
        unsavedChanges: 'Unsaved Changes',
        licenseExpiring: 'License Expiring Soon',
        licenseExpired: 'License Expired',
        backupFailed: 'Backup Failed',
        syncConflict: 'Sync Conflict'
      },
      info: {
        loading: 'Loading...',
        syncing: 'Syncing...',
        processing: 'Processing...',
        generating: 'AI Generating...',
        optimizing: 'Optimizing...'
      }
    },
    
    // 🌍 Menus and Tooltips
    menus: {
      context: {
        edit: 'Edit',
        delete: 'Delete',
        duplicate: 'Duplicate',
        copy: 'Copy Content',
        moveTo: 'Move To',
        addTags: 'Add Tags',
        removeTags: 'Remove Tags',
        suspend: 'Suspend',
        unsuspend: 'Unsuspend',
        bury: 'Bury',
        unbury: 'Unbury',
        flag: 'Flag',
        unflag: 'Unflag'
      },
      tooltips: {
        clickToEdit: 'Click to edit',
        doubleClickToView: 'Double click to view details',
        dragToSort: 'Drag to sort',
        rightClickForMore: 'Right click for more options'
      }
    },
    
    // 🌍 Study Interface
    studyInterface: {
      showAnswer: 'Show Answer',
      confirmAnswer: 'Confirm Answer',
      ratings: {
        again: 'Again',
        hard: 'Hard',
        good: 'Good',
        easy: 'Easy'
      },
      intervals: {
        unknown: 'Unknown',
        lessThan1Min: '< 1min',
        minutes: '{n}min',
        hours: '{n}h',
        days: '{n}d',
        months: '{n}mo',
        years: '{n}y'
      },
      progress: {
        ariaLabel: 'Study Progress',
        newCards: 'New {n}',
        learning: 'Learning {n}',
        review: 'Due {n}',
        mastered: 'Mastered {n}',
        total: 'Total {n} cards'
      },
      actions: {
        return: 'Return',
        regenerate: 'Regenerate',
        collect: 'Collect ({n})',
        undo: 'Undo'
      }
    },
    
    // 🌍 FSRS Algorithm Settings
    fsrs: {
      title: 'FSRS6 Algorithm Settings',
      description: 'Configure spaced repetition algorithm parameters',
      savedMessage: 'FSRS6 settings saved',
      saveFailed: 'Failed to save settings',
      basicParams: {
        title: 'Basic Parameters',
        retention: {
          label: 'Target Retention',
          description: 'Desired long-term memory retention rate (0.5-0.99)'
        },
        maxInterval: {
          label: 'Maximum Interval',
          description: 'Maximum review interval in days'
        },
        enableFuzz: {
          label: 'Enable Randomization',
          description: 'Add random fluctuation to calculated intervals'
        }
      },
      advancedSettings: {
        title: 'Advanced Settings',
        weights: {
          title: 'Weight Parameters',
          description: '21 weight parameters of FSRS6 algorithm, affecting memory prediction accuracy',
          allowEdit: 'Allow Editing',
          locked: 'Weight parameters are locked, enable "Allow Editing" to modify',
          warning: '⚠️ Modifying weight parameters may affect learning effectiveness, please proceed with caution',
          reset: 'Reset Default'
        }
      },
      optimization: {
        title: 'Smart Optimization',
        description: 'Automatically optimize FSRS6 parameters based on your learning data',
        dataPoints: 'Data Points',
        accuracy: 'Prediction Accuracy',
        status: 'Optimization Status',
        statusReady: 'Ready',
        statusOptimizing: 'Optimizing...',
        startButton: 'Start Optimization',
        optimizingButton: 'Optimizing...',
        complete: 'Parameter optimization complete',
        failed: 'Parameter optimization failed'
      },
      performance: {
        title: 'Performance Monitoring',
        description: 'Real-time monitoring of FSRS6 algorithm status and performance metrics',
        refresh: 'Refresh',
        algorithmVersion: 'Algorithm Version',
        executionTime: 'Execution Time',
        cacheHitRate: 'Cache Hit Rate',
        activeInstances: 'Active Instances',
        noData: 'Click refresh button to get performance metrics'
      },
      parameters: {
        title: 'Algorithm Parameters',
        targetRetention: {
          label: 'Target Retention',
          description: 'Desired long-term memory retention rate (0.5-0.99)',
          placeholder: 'e.g., 0.9 for 90% retention'
        },
        maxInterval: {
          label: 'Maximum Interval',
          description: 'Maximum days between reviews',
          unit: 'days'
        }
      },
      optimization: {
        title: 'Parameter Optimization',
        optimize: 'Optimize Parameters',
        optimizing: 'Optimizing...',
        optimizeDescription: 'Optimize algorithm parameters based on your study data',
        lastOptimized: 'Last Optimized'
      },
      actions: {
        reset: 'Reset to Default',
        import: 'Import Parameters',
        export: 'Export Parameters',
        save: 'Save Parameters',
        cancel: 'Cancel'
      }
    },
    
    // 🌍 Annotation Sync Settings
    annotation: {
      title: 'Annotation Sync Settings',
      description: 'Configure two-way sync between Obsidian annotations and cards',
      sync: {
        title: 'Sync Options',
        autoSync: {
          label: 'Auto Sync',
          description: 'Automatically monitor file changes and sync to cards'
        },
        syncInterval: {
          label: 'Sync Interval',
          description: 'Time interval for checking file changes',
          unit: 'seconds'
        },
        twoWaySync: {
          label: 'Two-Way Sync',
          description: 'Sync card content back to annotation blocks'
        },
        syncOnlyActive: {
          label: 'Sync Active File Only',
          description: 'Only sync currently open file to reduce performance impact'
        }
      },
      monitoring: {
        title: 'File Monitoring',
        detectDelay: {
          label: 'Detection Delay',
          description: 'Wait time after file changes to avoid frequent triggers',
          unit: 'milliseconds'
        }
      },
      advanced: {
        title: 'Advanced Options',
        maxConcurrent: {
          label: 'Max Concurrent Processing',
          description: 'Number of files processed simultaneously'
        },
        autoCreateDeck: {
          label: 'Auto Create Deck',
          description: 'Automatically create decks based on file path'
        }
      }
    },
    
    // 🌍 Card Parsing Settings
    parsing: {
      title: 'Card Parsing Settings',
      description: 'Configure batch card parsing rules for Markdown files',
      batchParsing: {
        title: 'Batch Parsing',
        enable: {
          label: 'Enable Batch Parsing',
          description: 'Scan and batch create cards from file markers'
        },
        markers: {
          title: 'Parse Markers',
          startMarker: {
            label: 'Start Marker',
            description: 'Start marker for batch parsing',
            default: '---start---'
          },
          endMarker: {
            label: 'End Marker',
            description: 'End marker for batch parsing',
            default: '---end---'
          }
        }
      },
      cloze: {
        title: 'Cloze Grammar',
        defaultSyntax: {
          label: 'Default Syntax',
          markdown: 'Markdown Highlight (==text==)',
          anki: 'Anki Format ({{c1::text}})'
        },
        autoDetect: {
          label: 'Auto Detect',
          description: 'Automatically detect and support both syntaxes'
        }
      }
    },
    
    // 🌍 AI Card Creation
    aiConfig: {
      title: 'AI Card Creation',
      description: 'Configure AI-assisted card creation features',
      providers: {
        title: 'AI Providers',
        openai: 'OpenAI',
        gemini: 'Google Gemini',
        anthropic: 'Anthropic Claude',
        deepseek: 'DeepSeek',
        zhipu: 'Zhipu AI',
        siliconflow: 'SiliconFlow',
        select: 'Select Provider'
      },
      apiKeys: {
        title: 'API Key Management',
        add: 'Add Key',
        edit: 'Edit Key',
        delete: 'Delete Key',
        verify: 'Verify Key',
        verifying: 'Verifying...',
        verified: 'Verified',
        invalid: 'Invalid',
        notSet: 'Not Set',
        placeholder: 'Enter API Key'
      },
      models: {
        title: 'Model Selection',
        select: 'Select Model',
        recommended: 'Recommended'
      }
    },
    
    // 🌍 Data Management
    dataManagement: {
      title: 'Data Management',
      description: 'Manage plugin data import, export, and backup',
      importExport: {
        title: 'Import/Export',
        import: {
          title: 'Import Data',
          button: 'Import',
          selectFile: 'Select File',
          importing: 'Importing...',
          success: 'Import Successful',
          failed: 'Import Failed'
        },
        export: {
          title: 'Export Data',
          button: 'Export',
          exporting: 'Exporting...',
          success: 'Export Successful',
          failed: 'Export Failed'
        }
      },
      backup: {
        title: 'Data Backup',
        auto: {
          title: 'Auto Backup',
          enable: 'Enable Auto Backup'
        },
        manual: {
          title: 'Manual Backup',
          create: 'Backup Now',
          creating: 'Creating Backup...',
          success: 'Backup Successful',
          failed: 'Backup Failed'
        }
      }
    },
    
    // 🌍 AnkiConnect Sync
    ankiConnect: {
      title: 'Anki Sync Settings',
      description: 'Configure sync with Anki desktop application',
      connection: {
        title: 'Connection Config',
        address: {
          label: 'Server Address',
          placeholder: 'http://localhost'
        },
        port: {
          label: 'Port',
          placeholder: '8765'
        },
        test: {
          button: 'Test Connection',
          testing: 'Testing...',
          success: 'Connection Successful',
          failed: 'Connection Failed'
        }
      },
      status: {
        title: 'Connection Status',
        connected: 'Connected',
        disconnected: 'Disconnected',
        syncing: 'Syncing...'
      }
    },
    
    // 🌍 Performance Optimization
    virtualization: {
      title: 'Performance Optimization',
      description: 'Configure virtual scrolling and rendering optimization to improve performance with large card sets',
      resetConfirm: 'Are you sure you want to reset all virtualization settings to default?',
      resetButton: 'Reset to Default',
      kanban: {
        title: 'Kanban View Settings',
        enableVirtualScroll: {
          label: 'Enable Virtual Scrolling',
          description: 'Enable virtual scrolling within kanban columns to greatly improve performance with large card sets (recommended for >200 cards)'
        },
        enableColumnVirtualization: {
          label: 'Column Virtualization',
          description: 'Enable virtual scrolling for each column individually (progressive loading still available when disabled)'
        },
        overscan: {
          label: 'Overscan Count',
          description: 'Number of cards to pre-render outside viewport, increase to reduce white screen during scrolling but uses more memory'
        },
        initialBatchSize: {
          label: 'Initial Load Count',
          description: 'Number of cards to initially load per column (effective in non-virtualization mode)'
        },
        loadMoreBatchSize: {
          label: 'Batch Load Count',
          description: 'Number of cards to load at once when clicking "Load More"'
        }
      },
      table: {
        title: 'Table View Settings',
        enableVirtualScroll: {
          label: 'Enable Virtual Scrolling',
          description: 'Enable virtual scrolling in table view (currently defaults to pagination)'
        },
        enableTableVirtualization: {
          label: 'Enable Table Virtualization',
          description: 'Enable virtual scrolling for table rows (requires virtual scrolling enabled first)'
        },
        paginationThreshold: {
          label: 'Pagination Threshold',
          description: 'Use pagination instead of virtual scrolling below this count (recommended: 500)'
        }
      },
      advanced: {
        title: 'Advanced Options',
        cacheItemHeight: {
          label: 'Cache Measured Heights',
          description: 'Cache measured card heights to improve performance (recommended)'
        },
        estimatedItemHeight: {
          label: 'Estimated Item Height',
          description: 'Initial height estimate for virtual scrolling (pixels)'
        },
        resetSettings: {
          label: 'Reset Settings',
          description: 'Reset all virtualization settings to default values'
        }
      },
      tips: {
        title: 'Performance Optimization Tips',
        tip1: 'Virtual scrolling automatically enables when card count exceeds 200, no manual intervention needed',
        tip2: 'Increasing Overscan reduces white screen during scrolling but increases memory usage',
        tip3: 'Pagination mode is recommended for table view unless you need quick browsing of large datasets',
        tip4: 'Enabling height cache significantly improves scrolling performance with minimal memory cost'
      }
    },
    
    // 🌍 About
    about: {
      title: 'About Tuanki',
      product: {
        name: 'Tuanki - Intelligent Flashcard Plugin',
        version: 'Version',
        algorithm: 'Algorithm',
        description: 'Intelligent spaced repetition learning system based on FSRS6 algorithm'
      },
      license: {
        title: 'License Information',
        status: 'Status',
        type: 'Type',
        activation: {
          title: 'License Activation',
          code: 'Activation Code',
          placeholder: 'Enter license activation code',
          activate: 'Activate',
          activating: 'Activating...'
        }
      },
      contact: {
        title: 'Contact',
        github: 'GitHub Repository',
        email: 'Email',
        support: 'Technical Support'
      }
    }
  }
};

// ============================================================================
// 国际化配置
// ============================================================================

const defaultConfig: I18nConfig = {
  defaultLanguage: 'zh-CN',
  fallbackLanguage: 'zh-CN',
  supportedLanguages: ['zh-CN', 'en-US']
};

// ============================================================================
// 状态管理
// ============================================================================

export const currentLanguage = writable<SupportedLanguage>(defaultConfig.defaultLanguage);
export const i18nConfig = writable<I18nConfig>(defaultConfig);

// ============================================================================
// 国际化服务类
// ============================================================================

export class I18nService {
  private static instance: I18nService;
  private currentLang: SupportedLanguage = defaultConfig.defaultLanguage;
  private config: I18nConfig = defaultConfig;

  private constructor() {
    // 订阅语言变化
    currentLanguage.subscribe(lang => {
      this.currentLang = lang;
    });

    // 订阅配置变化
    i18nConfig.subscribe(config => {
      this.config = config;
    });
  }

  static getInstance(): I18nService {
    if (!I18nService.instance) {
      I18nService.instance = new I18nService();
    }
    return I18nService.instance;
  }

  /**
   * 获取翻译文本
   */
  t(key: string, params?: Record<string, string | number>): string {
    const translation = this.getTranslation(key, this.currentLang);

    if (!translation) {
      // 尝试回退语言
      const fallbackTranslation = this.getTranslation(key, this.config.fallbackLanguage);
      if (fallbackTranslation) {
        return this.interpolate(fallbackTranslation, params);
      }

      // 返回键名作为最后的回退
      console.warn(`Translation not found for key: ${key}`);
      return key;
    }

    return this.interpolate(translation, params);
  }

  /**
   * 获取指定语言的翻译
   */
  private getTranslation(key: string, language: SupportedLanguage): string | null {
    const keys = key.split('.');
    let current: any = translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return null;
      }
    }

    return typeof current === 'string' ? current : null;
  }

  /**
   * 插值处理
   */
  private interpolate(text: string, params?: Record<string, string | number>): string {
    if (!params) return text;

    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }

  /**
   * 设置当前语言
   */
  setLanguage(language: SupportedLanguage): void {
    if (this.config.supportedLanguages.includes(language)) {
      currentLanguage.set(language);
    } else {
      console.warn(`Unsupported language: ${language}`);
    }
  }

  /**
   * 获取当前语言
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLang;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return this.config.supportedLanguages;
  }

  /**
   * 检查是否支持指定语言
   */
  isLanguageSupported(language: string): language is SupportedLanguage {
    return this.config.supportedLanguages.includes(language as SupportedLanguage);
  }
}

// ============================================================================
// 导出实例和工具函数
// ============================================================================

export const i18n = I18nService.getInstance();

// 便捷的翻译函数
export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params);

// Svelte store 用于响应式翻译
export const tr = derived(
  currentLanguage,
  ($currentLanguage) => (key: string, params?: Record<string, string | number>) => i18n.t(key, params)
);
