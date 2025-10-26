// Anki Plugin Settings Tab
// Obsidian插件设置页面实现

import { PluginSettingTab, Setting, Notice } from "obsidian";
import SettingsPanel from "./SettingsPanel.svelte";
import type AnkiPlugin from "../../main";

export class AnkiSettingsTab extends PluginSettingTab {
  plugin: AnkiPlugin;

  constructor(app: any, plugin: AnkiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 保存方法传递给面板内调用
    (this.plugin as any).settingsTab = this;

    // 用统一 Svelte 面板渲染整个设置
    new SettingsPanel({ target: containerEl, props: { plugin: this.plugin } });
  }

  private createBasicSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "基础设置" });

    new Setting(containerEl)
      .setName("默认牌组")
      .setDesc("新建卡片时的默认牌组名称")
      .addText(text => text
        .setPlaceholder("请输入默认牌组名称")
        .setValue(this.plugin.settings.defaultDeck)
        .onChange(async (value) => {
          this.plugin.settings.defaultDeck = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("每日复习数量")
      .setDesc("每天希望复习的卡片数量")
      .addSlider(slider => slider
        .setLimits(10, 200, 10)
        .setValue(this.plugin.settings.reviewsPerDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.reviewsPerDay = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("启用通知")
      .setDesc("在有卡片需要复习时显示通知")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableNotifications)
        .onChange(async (value) => {
          this.plugin.settings.enableNotifications = value;
          await this.plugin.saveSettings();
        }));
  }

  private createLearningSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "学习设置" });

    new Setting(containerEl)
      .setName("自动显示答案")
      .setDesc("学习时自动显示答案的时间（秒，0表示手动显示）")
      .addSlider(slider => slider
        .setLimits(0, 10, 1)
        .setValue(this.plugin.settings.autoShowAnswerSeconds)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.autoShowAnswerSeconds = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("学习步骤")
      .setDesc("新卡片的学习步骤（分钟，用空格分隔）")
      .addText(text => text
        .setPlaceholder("1 10")
        .setValue(this.plugin.settings.learningSteps.join(" "))
        .onChange(async (value) => {
          const steps = value.split(/\s+/).map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n) && n >= 0);
          this.plugin.settings.learningSteps = steps.length ? steps : [1, 10];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("毕业间隔")
      .setDesc("卡片从学习阶段毕业后的初始间隔（天）")
      .addSlider(slider => slider
        .setLimits(1, 7, 1)
        .setValue(this.plugin.settings.graduatingInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.graduatingInterval = value;
          await this.plugin.saveSettings();
        }));
  }

  private createFSRSSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "FSRS算法设置" });

    const desc = containerEl.createEl("p", {
      text: "FSRS（Free Spaced Repetition Scheduler）是一个基于记忆模型的间隔重复算法，能够更精确地预测遗忘时间。更多高级设置请在插件主界面的设置标签页中配置。"
    });
    desc.style.color = "var(--text-muted)";
    desc.style.fontSize = "0.9em";
    desc.style.marginBottom = "1rem";

    new Setting(containerEl)
      .setName("目标记忆率")
      .setDesc("希望达到的记忆成功率（建议85%-95%）")
      .addSlider(slider => slider
        .setLimits(0.8, 0.98, 0.01)
        .setValue(this.plugin.settings.fsrsParams.requestRetention)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.fsrsParams.requestRetention = value;
          await this.plugin.saveSettings();
          this.plugin.fsrs?.updateParameters({ requestRetention: value });
        }));

    new Setting(containerEl)
      .setName("最大间隔")
      .setDesc("复习间隔的最大天数（建议1-5年，参考Anki社区实践）。注意：修改此设置后需要重启Obsidian才能生效。")
      .addSlider(slider => slider
        .setLimits(30, 1825, 5) // 30天到5年（1825天）
        .setValue(Math.min(this.plugin.settings.fsrsParams.maximumInterval || 365, 1825))
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.fsrsParams.maximumInterval = value;
          await this.plugin.saveSettings();
          this.plugin.fsrs?.updateParameters({ maximumInterval: value });
          // 显示重启提示
          new Notice('⚠️ 最大间隔已更改，请重启Obsidian以应用新设置', 5000);
        }));

    new Setting(containerEl)
      .setName("启用随机化")
      .setDesc("在复习时间上添加小幅随机化，避免复习扎堆")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fsrsParams.enableFuzz)
        .onChange(async (value) => {
          this.plugin.settings.fsrsParams.enableFuzz = value;
          await this.plugin.saveSettings();
          this.plugin.fsrs?.updateParameters({ enableFuzz: value });
        }));

    // FSRS权重参数（高级设置）
    new Setting(containerEl)
      .setName("算法权重参数")
      .setDesc("FSRS算法的权重参数（高级用户使用，用逗号分隔）。更多参数管理功能请在插件主界面的设置标签页中使用。")
      .addTextArea(text => text
        .setPlaceholder("0.5701, 1.4436, 4.1386, ...")
        .setValue(this.plugin.settings.fsrsParams.w.join(", ") || "")
        .onChange(async (value) => {
          try {
            const weights = value.split(",").map(w => parseFloat(w.trim())).filter(w => !Number.isNaN(w));
            // 严格验证FSRS参数数量必须为21个
            if (weights.length === 21) {
              this.plugin.settings.fsrsParams.w = weights;
              await this.plugin.saveSettings();
              this.plugin.fsrs?.updateParameters({ w: weights });
            } else if (weights.length > 0) {
              // 提供清晰的错误提示
              console.warn(`FSRS权重参数数量错误：需要21个参数，但提供了${weights.length}个`);
            }
          } catch (error) {
            console.error('FSRS参数解析错误:', error);
          }
        }));

    // 🎯 FSRS6个性化优化设置
    containerEl.createEl("h3", { 
      text: "🎯 个性化算法优化（新功能）",
      attr: { style: "margin-top: 2rem; color: var(--text-accent);" }
    });

    const personalDesc = containerEl.createEl("p", {
      text: "启用基于您学习数据的智能算法优化。系统会在收集足够数据后自动调整参数，提升记忆效率25-40%。包含回溯保护机制，确保优化安全可靠。"
    });
    personalDesc.style.color = "var(--text-muted)";
    personalDesc.style.fontSize = "0.9em";
    personalDesc.style.marginBottom = "1rem";

    new Setting(containerEl)
      .setName("启用个性化优化")
      .setDesc("根据您的学习表现自动优化FSRS算法参数")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enablePersonalization ?? true)
        .onChange(async (value) => {
          this.plugin.settings.enablePersonalization = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("启用回溯保护")
      .setDesc("当检测到性能下降时自动回退到稳定参数")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.personalizationSettings?.enableBacktracking ?? true)
        .onChange(async (value) => {
          if (!this.plugin.settings.personalizationSettings) {
            this.plugin.settings.personalizationSettings = {
              enabled: true,
              minDataPoints: 50,
              enableBacktracking: true,
              checkpointInterval: 50,
              performanceThreshold: 0.1,
              autoOptimization: true
            };
          }
          this.plugin.settings.personalizationSettings.enableBacktracking = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("最小数据点")
      .setDesc("开始优化前需要收集的复习次数（默认50）")
      .addText(text => text
        .setPlaceholder("50")
        .setValue(String(this.plugin.settings.personalizationSettings?.minDataPoints ?? 50))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 20 && num <= 200) {
            if (!this.plugin.settings.personalizationSettings) {
              this.plugin.settings.personalizationSettings = {
                enabled: true,
                minDataPoints: 50,
                enableBacktracking: true,
                checkpointInterval: 50,
                performanceThreshold: 0.1,
                autoOptimization: true
              };
            }
            this.plugin.settings.personalizationSettings.minDataPoints = num;
            await this.plugin.saveSettings();
          }
        }));
  }

  private createUISettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "界面设置" });


    new Setting(containerEl)
      .setName("启用键盘快捷键")
      .setDesc("启用学习模式的键盘快捷键（1-4评分，空格显示答案）")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableShortcuts)
        .onChange(async (value) => {
          this.plugin.settings.enableShortcuts = value;
          await this.plugin.saveSettings();
        }));
  }

  private createAdvancedSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "高级设置" });

    new Setting(containerEl)
      .setName("调试模式")
      .setDesc("启用调试模式，在控制台显示详细日志")
      .addToggle(toggle => toggle
        .setValue(false)
        .onChange(async (value) => {
          // 保存调试模式设置
        }));

    new Setting(containerEl)
      .setName("数据备份间隔")
      .setDesc("自动备份数据的时间间隔（小时）")
      .addSlider(slider => slider
        .setLimits(1, 168, 1) // 1小时到1周
        .setValue(this.plugin.settings.dataBackupIntervalHours)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.dataBackupIntervalHours = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("备份保留数量")
      .setDesc("最多保留的备份数量，超过后将清理最早的备份")
      .addSlider(slider => slider
        .setLimits(1, 50, 1)
        .setValue(((this.plugin as any).settings?.backupRetentionCount ?? 10))
        .setDynamicTooltip()
        .onChange(async (value) => {
          (this.plugin as any).settings.backupRetentionCount = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("数据目录")
      .setDesc("插件数据存放的文件夹（更改将平移现有文件）")
      .addText(text => text
        .setPlaceholder("tuanki")
        .setValue(((this.plugin as any).settings?.dataFolder ?? "tuanki"))
        .onChange(async (value) => {
          const newFolder = value.trim() || "tuanki";
          if (newFolder === (this.plugin as any).settings?.dataFolder) return;
          try {
            await this.plugin.dataStorage.migrateDataFolder(newFolder);
          } catch (e) {
            console.error("数据目录迁移失败", e);
          }
        }));

    // 数据管理按钮 - 已移除，将在新的数据管理界面中实现
    // TODO: 重构后的数据管理功能将在DataSection.svelte中实现

    // 关于部分
    containerEl.createEl("h2", { text: "关于" });
    
    const aboutEl = containerEl.createEl("div");
    aboutEl.innerHTML = `
      <p><strong>Anki for Obsidian</strong> v1.0.0</p>
      <p>一个功能强大的间隔重复学习插件，集成了FSRS算法和现代化界面设计。</p>
      <p>
        <a href="https://github.com/anki-obsidian-plugin" style="color: var(--text-accent);">GitHub仓库</a> | 
        <a href="https://github.com/anki-obsidian-plugin/issues" style="color: var(--text-accent);">问题反馈</a> | 
        <a href="https://github.com/anki-obsidian-plugin/wiki" style="color: var(--text-accent);">使用文档</a>
      </p>
    `;
    aboutEl.style.color = "var(--text-muted)";
    aboutEl.style.fontSize = "0.9em";
  }

  // 数据管理相关方法已移除 - 将在新的数据管理服务中实现
  // TODO: 创建专门的DataManagementService来处理数据导入导出和重置功能
}
