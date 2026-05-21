<!--
  数据管理模态窗
  职责：集中展示数据检查、修复与迁移能力
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Notice } from 'obsidian';
  import { logger } from '../../utils/logger';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import { 
    getDataManagementService,
    MIGRATION_CHECK_TYPES,
    DEFAULT_BATCH_FIX_TYPES,
    HIGH_RISK_FIX_TYPES,
    MAIN_PLUGIN_HIGH_RISK_FIX_TYPES,
    isHighRiskFixType,
    isTemporaryCheckType,
    getDataCheckLifecycleKind,
    getDataCheckLifecycleLabel,
    getDataCheckLifecycleNote,
    getDataCheckDisplayName,
    filterDisplayableDataCheckResults,
    type DataCheckResult,
    type DataFixResult,
    type CheckType
  } from '../../services/data-management/DataManagementService';
  import type { 
    ScanResult, 
    QualityIssue, 
    ScanConfig,
    QualityIssueType 
  } from '../../types/card-quality-types';
  import { DEFAULT_SCAN_CONFIG } from '../../types/card-quality-types';
  import { getCardQualityInboxService, CardQualityInboxService } from '../../services/card-quality/CardQualityInboxService';
  import type { IssueSeverity } from '../../types/card-quality-types';
  import { deleteMemoryCard } from '../../services/weave-domain';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { tr, t } from '../../utils/i18n';
  import { showDangerConfirm } from '../../utils/obsidian-confirm';

  // ===== Props =====
  interface Props {
    /** 插件实例 */
    plugin: WeavePlugin;
    /** 当前筛选的卡片 */
    cards?: Card[];
    /** 全部卡片 */
    allCards?: Card[];
    /** 初始标签页 */
    initialTab?: 'data';
  }

  let {
    plugin,
    cards = [],
    allCards = [],
    initialTab = 'data'
  }: Props = $props();
  
  // 扫描范围
  type ScanScope = 'filtered' | 'all';
  let scanScope = $state<ScanScope>('filtered');
  let scanTargetCards = $derived(scanScope === 'all' ? allCards : cards);

  // ===== 数据管理 State =====
  let isChecking = $state(false);
  let isFixing = $state(false);
  let isMigrating = $state(false);
  let checkResults = $state<DataCheckResult[]>([]);
  let fixResults = $state<DataFixResult[]>([]);
  let migrationResults = $state<DataCheckResult[]>([]);
  let latestMigrationSummary = $state<{ targetRoot: string; movedFiles: number; conflicts: number; rewrittenReferences: number; remainingLegacyRoots: number; reportTime: string } | null>(null);
  let logs = $state<string[]>([]);
  let progressMessage = $state('');
  let progressCurrent = $state(0);
  let progressTotal = $state(0);
  let progressPercent = $derived(progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0);

  // ===== 质量扫描 State =====
  let isScanning = $state(false);
  let scanProgress = $state({ current: 0, total: 0, phase: 'preparing' as string, message: '' });
  let scanResult = $state<ScanResult | null>(null);
  let scanConfig = $state<ScanConfig>({ ...DEFAULT_SCAN_CONFIG });
  let scanView = $state<'config' | 'scanning' | 'result'>('config');
  let selectedIssues = $state(new Set<string>());
  
  // 筛选和排序状态
  let filterSeverity = $state<IssueSeverity | 'all'>('all');
  let filterType = $state<QualityIssueType | 'all'>('all');
  let sortBy = $state<'severity' | 'type'>('severity');

  // 问题类型标签映射
  const issueTypeLabels = $derived.by(() => ({
    duplicate_exact: t('management.cardQuality.issueTypes.duplicateExact'),
    duplicate_similar: t('management.cardQuality.issueTypes.duplicateSimilar'),
    empty_content: t('management.cardQuality.issueTypes.emptyContent'),
    too_short: t('management.cardQuality.issueTypes.tooShort'),
    too_long: t('management.cardQuality.issueTypes.tooLong'),
    missing_answer: t('management.cardQuality.issueTypes.missingAnswer'),
    missing_question: t('management.cardQuality.issueTypes.missingQuestion'),
    low_retention: t('management.cardQuality.issueTypes.lowRetention'),
    high_difficulty: t('management.cardQuality.issueTypes.highDifficulty'),
    orphan_card: t('management.cardQuality.issueTypes.orphanCard'),
    invalid_format: t('management.cardQuality.issueTypes.invalidFormat'),
    source_missing: t('management.cardQuality.issueTypes.sourceMissing')
  }) satisfies Record<QualityIssueType, string>);

  // 严重程度颜色
  const severityColors = {
    error: 'var(--color-red)',
    warning: 'var(--color-yellow)',
    info: 'var(--color-blue)'
  };

  // 按卡片UUID分组问题
  interface GroupedIssue {
    cardUuid: string;
    issues: QualityIssue[];
    issueIds: string[];
  }

  // 基于当前 issues 动态计算统计，忽略项目变化后会自动更新
  let currentIssues = $derived(scanResult?.issues ?? []);
  let computedStats = $derived.by(() => {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { error: 0, warning: 0, info: 0 };
    for (const issue of currentIssues) {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    }
    return { byType, bySeverity };
  });
  
  // 筛选后的问题列表
  let filteredIssues = $derived.by(() => {
    if (!scanResult) return [];
    return scanResult.issues.filter(issue => {
      if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
      if (filterType !== 'all' && issue.type !== filterType) return false;
      return true;
    });
  });
  
  let groupedIssues = $derived.by(() => {
    if (!filteredIssues.length) return [];
    const groups = new Map<string, GroupedIssue>();
    for (const issue of filteredIssues) {
      if (!groups.has(issue.cardUuid)) {
        groups.set(issue.cardUuid, { cardUuid: issue.cardUuid, issues: [], issueIds: [] });
      }
      const group = groups.get(issue.cardUuid)!;
      group.issues.push(issue);
      group.issueIds.push(issue.id);
    }
    
    // 排序
    const result = Array.from(groups.values());
    if (sortBy === 'severity') {
      const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
      result.sort((a, b) => {
        const aMin = Math.min(...a.issues.map(i => severityOrder[i.severity] ?? 3));
        const bMin = Math.min(...b.issues.map(i => severityOrder[i.severity] ?? 3));
        return aMin - bMin;
      });
    }
    return result;
  });

  // ===== Service =====
  const dataService = getDataManagementService(untrack(() => plugin));

  async function refreshLatestMigrationSummary() {
    const report = await dataService.getLatestMigrationReport();
    if (!report) {
      latestMigrationSummary = null;
      return;
    }

    latestMigrationSummary = {
      targetRoot: report.plan.targetRoot,
      movedFiles: report.movedFiles,
      conflicts: report.conflicts,
      rewrittenReferences: report.rewrittenReferences,
      remainingLegacyRoots: report.verification?.remainingLegacyRoots.length ?? report.untouchedLegacyRoots.length,
      reportTime: report.completedAt || report.startedAt,
    };
  }

  // ===== Methods =====
  function addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    logs = [...logs, `[${time}] ${message}`];
  }

  function startGlobalProgress(_title: string, total: number, detail: string) {
    progressCurrent = 0;
    progressTotal = Math.max(1, total);
    progressMessage = detail;
  }

  function updateSharedProgress(current: number, total: number, message: string) {
    progressCurrent = current;
    progressTotal = Math.max(1, total);
    progressMessage = message;
  }

  function finishGlobalProgress(_status: 'success' | 'error', detail: string, current?: number, total?: number) {
    const finalTotal = Math.max(1, total ?? (progressTotal || 1));
    const finalCurrent = Math.max(0, Math.min(finalTotal, current ?? (progressCurrent || finalTotal)));
    progressCurrent = finalCurrent;
    progressTotal = finalTotal;
    progressMessage = detail;
  }

  function resetLocalProgress() {
    progressMessage = '';
    progressCurrent = 0;
    progressTotal = 0;
  }

  function getLifecycleKind(type: CheckType): 'temporary' | 'long_term' {
    return getDataCheckLifecycleKind(type);
  }

  function getLifecycleLabel(type: CheckType): string {
    return getDataCheckLifecycleLabel(type);
  }

  function getLifecycleNote(type: CheckType): string {
    return getDataCheckLifecycleNote(type);
  }

  function isTemporaryType(type: CheckType): boolean {
    return isTemporaryCheckType(type);
  }

  const activeCheckResults = $derived(checkResults.filter(result => !isTemporaryType(result.type)));
  const activeMigrationResults = $derived(migrationResults.filter(result => !isTemporaryType(result.type)));
  const activeCheckSectionTitle = $derived($tr('management.dataHealth.sectionTitle'));
  const activeMigrationSectionTitle = $derived($tr('management.dataHealth.migrationSectionTitle'));
  const activeMigrationActionLabel = $derived($tr('management.dataHealth.checkMigrationStatus'));
  const activeCheckEmptyMessage = $derived($tr('management.dataHealth.emptyCheckResults'));
  const activeMigrationEmptyMessage = $derived($tr('management.dataHealth.emptyMigrationResults'));
  const activeFixableTypes = $derived(
    activeCheckResults
      .filter(result => result.count > 0 && DEFAULT_BATCH_FIX_TYPES.includes(result.type))
      .map(result => result.type)
  );

  async function runMigrationChecks(
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<DataCheckResult[]> {
    const results: DataCheckResult[] = [];
    for (let i = 0; i < MIGRATION_CHECK_TYPES.length; i++) {
      const type = MIGRATION_CHECK_TYPES[i];
      onProgress?.(i, MIGRATION_CHECK_TYPES.length, t('management.dataManagementModal.progress.checkingType', { name: getTypeName(type) }));
      const result = await dataService.check(type);
      results.push(result);
      onProgress?.(i + 1, MIGRATION_CHECK_TYPES.length, t('management.dataManagementModal.progress.checkedType', { name: getTypeName(type) }));
    }

    await refreshLatestMigrationSummary();
    return filterDisplayableDataCheckResults(results);
  }

  function upsertMigrationResult(result: DataCheckResult) {
    const existingIndex = migrationResults.findIndex(item => item.type === result.type);
    if (existingIndex >= 0) {
      migrationResults[existingIndex] = result;
      migrationResults = [...migrationResults];
      return;
    }

    migrationResults = [...migrationResults, result];
  }

  async function executeTrackedMigrationTask<T>(config: {
    title: string;
    startLog: string;
    initialDetail: string;
    totalSteps: number;
    run: () => Promise<T>;
    postRunDetail?: string | ((result: T) => string);
    afterRun?: (result: T) => Promise<void>;
    successLog: (result: T) => string;
    successDetail: (result: T) => string;
    errorLogPrefix: string;
    errorDetailPrefix: string;
  }): Promise<T | null> {
    isMigrating = true;
    addLog(config.startLog);
    startGlobalProgress(config.title, config.totalSteps, config.initialDetail);
    updateSharedProgress(0, config.totalSteps, config.initialDetail);

    try {
      const result = await config.run();
      if (config.afterRun) {
        const postRunDetail = typeof config.postRunDetail === 'function'
          ? config.postRunDetail(result)
          : (config.postRunDetail || t('management.dataManagementModal.refreshingResults'));
        updateSharedProgress(1, config.totalSteps, postRunDetail);
        await config.afterRun(result);
      }

      addLog(config.successLog(result));
      finishGlobalProgress('success', config.successDetail(result), config.totalSteps, config.totalSteps);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${config.errorLogPrefix}: ${message}`);
      finishGlobalProgress('error', `${config.errorDetailPrefix}：${message}`, progressCurrent, progressTotal || config.totalSteps);
      return null;
    } finally {
      isMigrating = false;
      resetLocalProgress();
    }
  }

  function getHighRiskFixWarning(type: CheckType): string {
    if (type === 'ir_redundant_frontmatter_cleanup') {
      return t('management.dataManagementModal.highRiskWarnings.irRedundantFrontmatterCleanup');
    }

    if (type === 'epub_markdown_source_id_backfill') {
      return t('management.dataManagementModal.highRiskWarnings.epubMarkdownSourceIdBackfill');
    }

    if (type === 'wdeck_migration') {
      return t('management.dataManagementModal.highRiskWarnings.wdeckMigration');
    }

    if (type === 'ir_point_storage_migration') {
      return t('management.dataManagementModal.highRiskWarnings.irPointStorageMigration');
    }

    if (type === 'ir_legacy_readable_markdown_migration') {
      return t('management.dataManagementModal.highRiskWarnings.irLegacyReadableMarkdownMigration');
    }

    if (type === 'qbank_migration') {
      return t('management.dataManagementModal.highRiskWarnings.qbankMigration');
    }

    switch (type) {
      case 'migration_conflict_files':
        return t('management.dataManagementModal.highRiskWarnings.migrationConflictFiles');
      case 'duplicate_cards':
        return t('management.dataManagementModal.highRiskWarnings.duplicateCards');
      case 'ir_material_consistency':
        return t('management.dataManagementModal.highRiskWarnings.irMaterialConsistency');
      case 'filename_compatibility':
        return t('management.dataManagementModal.highRiskWarnings.filenameCompatibility');
      case 'sync_conflict_files':
        return t('management.dataManagementModal.highRiskWarnings.syncConflictFiles');
      case 'progressive_cloze_unconverted':
        return t('management.dataManagementModal.highRiskWarnings.progressiveClozeUnconverted');
      case 'legacy_cleanup':
        return t('management.dataManagementModal.highRiskWarnings.legacyCleanup');
      default:
        return t('management.dataManagementModal.highRiskWarnings.default');
    }
  }

  async function confirmHighRiskFix(type: CheckType): Promise<boolean> {
    return showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.confirmFixBody', { name: getTypeName(type), warning: getHighRiskFixWarning(type) }),
      t('management.dataManagementModal.actions.confirmFixTitle', { name: getTypeName(type) })
    );
  }

  async function handleCheckAll() {
    isChecking = true;
    checkResults = [];
    addLog(t('management.dataManagementModal.logs.startCheckAll'));
    startGlobalProgress(
      t('management.dataManagementModal.actions.checkAllTitle'),
      1,
      t('management.dataManagementModal.actions.checkAllDetail')
    );

    try {
      checkResults = await dataService.checkAll((current, total, msg) => {
        updateSharedProgress(current, total, msg);
      });

      const totalIssues = checkResults.reduce((sum, r) => sum + r.count, 0);
      addLog(t('management.dataManagementModal.logs.checkAllDone', { count: totalIssues }));
      finishGlobalProgress('success', t('management.dataManagementModal.actions.checkAllSuccess', { count: totalIssues }), progressTotal, progressTotal);
    } catch (e) {
      addLog(t('management.dataManagementModal.logs.checkFailed', { message: String(e) }));
      finishGlobalProgress('error', t('management.dataManagementModal.actions.checkAllFailed', { message: String(e) }), progressCurrent, progressTotal || 1);
    } finally {
      isChecking = false;
      resetLocalProgress();
    }
  }

  async function handleFixAll() {
    isFixing = true;
    fixResults = [];
    addLog(t('management.dataManagementModal.logs.startFixAll'));
    startGlobalProgress(
      t('management.dataManagementModal.actions.fixAllTitle'),
      1,
      t('management.dataManagementModal.actions.fixAllDetail')
    );

    try {
      fixResults = await dataService.fixAll((current, total, msg) => {
        updateSharedProgress(current, total, msg);
      });

      const totalSuccess = fixResults.reduce((sum, r) => sum + r.success, 0);
      const totalFailed = fixResults.reduce((sum, r) => sum + r.failed, 0);
      addLog(t('management.dataManagementModal.logs.fixAllDone', { success: totalSuccess, failed: totalFailed }));

      // 重新检测
      addLog(t('management.dataManagementModal.logs.fixAllSafeOnly', { names: DEFAULT_BATCH_FIX_TYPES.map(type => getTypeName(type)).join('、') }));
      addLog(t('management.dataManagementModal.logs.fixAllHighRisk', { names: MAIN_PLUGIN_HIGH_RISK_FIX_TYPES.map(type => getTypeName(type)).join('、') }));
      finishGlobalProgress('success', t('management.dataManagementModal.actions.fixAllSuccess', { success: totalSuccess, failed: totalFailed }), progressTotal, progressTotal);
      await handleCheckAll();
    } catch (e) {
      addLog(t('management.dataManagementModal.logs.fixAllFailed', { message: String(e) }));
      finishGlobalProgress('error', t('management.dataManagementModal.actions.fixAllFailed', { message: String(e) }), progressCurrent, progressTotal || 1);
    } finally {
      isFixing = false;
      resetLocalProgress();
    }
  }

  async function handleCheckCurrentTab() {
		await handleCheckAll();
		await handleCheckMigration();
  }

  async function handleFixCurrentTab() {
		if (activeFixableTypes.length === 0) {
			new Notice(t('management.dataManagementModal.noSafeFixes'));
			return;
		}

		isFixing = true;
		fixResults = [];
		addLog(t('management.dataManagementModal.logs.startFixCurrentTab', { names: activeFixableTypes.map(type => getTypeName(type)).join('、') }));
		startGlobalProgress(
      t('management.dataManagementModal.actions.fixCurrentTabTitle'),
      activeFixableTypes.length,
      t('management.dataManagementModal.actions.fixCurrentTabDetail')
    );

		try {
			const results: DataFixResult[] = [];
			for (let i = 0; i < activeFixableTypes.length; i++) {
				const type = activeFixableTypes[i];
				updateSharedProgress(i + 1, activeFixableTypes.length, t('management.dataManagementModal.progress.fixingType', { name: getTypeName(type) }));
				const result = await dataService.fix(type);
				results.push(result);
				plugin.cardFileService?.clearCache?.();
			}

			fixResults = results;
			const totalSuccess = results.reduce((sum, result) => sum + result.success, 0);
			const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
			addLog(t('management.dataManagementModal.logs.fixCurrentTabDone', { success: totalSuccess, failed: totalFailed }));
			finishGlobalProgress(
				'success',
				t('management.dataManagementModal.actions.fixCurrentTabSuccess', { success: totalSuccess, failed: totalFailed }),
				activeFixableTypes.length,
				activeFixableTypes.length
			);
			await handleCheckCurrentTab();
		} catch (e) {
			addLog(t('management.dataManagementModal.logs.fixCurrentTabFailed', { message: String(e) }));
			finishGlobalProgress('error', t('management.dataManagementModal.actions.fixCurrentTabFailed', { message: String(e) }), progressCurrent, progressTotal || 1);
		} finally {
			isFixing = false;
			resetLocalProgress();
		}
  }

  async function handleCheck(type: CheckType) {
    isChecking = true;
    addLog(t('management.dataManagementModal.logs.checkType', { name: getTypeName(type) }));

    try {
      const result = await dataService.check(type);
      
      // 更新或添加结果
      const existingIndex = checkResults.findIndex(r => r.type === type);
      if (existingIndex >= 0) {
        checkResults[existingIndex] = result;
        checkResults = [...checkResults];
      } else {
        checkResults = [...checkResults, result];
      }

      addLog(result.message);
    } catch (e) {
      addLog(t('management.dataManagementModal.logs.checkFailed', { message: String(e) }));
    } finally {
      isChecking = false;
    }
  }

  async function refreshResultsAfterFix(type: CheckType) {
    const existsInMigrationResults = migrationResults.some((result) => result.type === type);
    const existsInCheckResults = checkResults.some((result) => result.type === type);

    if (existsInMigrationResults) {
      await handleCheckMigration();
    }

    if (existsInCheckResults || !existsInMigrationResults) {
      await handleCheck(type);
    }
  }

  async function handleFix(type: CheckType) {
    if (isHighRiskFixType(type)) {
      const confirmed = await confirmHighRiskFix(type);
      if (!confirmed) {
        addLog(t('management.dataManagementModal.logs.cancelFixType', { name: getTypeName(type) }));
        return;
      }
    }

    isFixing = true;
    startGlobalProgress(t('management.dataManagementModal.progress.fixingType', { name: getTypeName(type) }), 2, t('management.dataManagementModal.progress.fixingType', { name: getTypeName(type) }));
    updateSharedProgress(0, 2, t('management.dataManagementModal.progress.fixingType', { name: getTypeName(type) }));
    addLog(t('management.dataManagementModal.logs.fixType', { name: getTypeName(type) }));

    try {
      const result = await dataService.fix(type, { allowHighRisk: isHighRiskFixType(type) });
      updateSharedProgress(1, 2, t('management.dataManagementModal.progress.recheckingAfterFix', { name: getTypeName(type) }));
      addLog(t('management.dataManagementModal.logs.fixTypeDone', { success: result.success, failed: result.failed }));

      await refreshResultsAfterFix(type);
      updateSharedProgress(2, 2, t('management.dataManagementModal.progress.fixAndRecheckDone', { name: getTypeName(type) }));
      finishGlobalProgress('success', t('management.dataManagementModal.actions.fixCurrentTabSuccess', { success: result.success, failed: result.failed }), 2, 2);
    } catch (e) {
      addLog(t('management.dataManagementModal.logs.fixAllFailed', { message: String(e) }));
      finishGlobalProgress('error', t('management.dataManagementModal.actions.fixAllFailed', { message: String(e) }), progressCurrent, progressTotal || 2);
    } finally {
      isFixing = false;
      resetLocalProgress();
    }
  }

  function supportsDirectFix(_type: CheckType): boolean {
    return true;
  }

  // ===== 迁移检测方法 =====
  async function handleCheckMigration() {
    isMigrating = true;
    migrationResults = [];
    addLog(t('management.dataManagementModal.logs.startMigrationCheck'));
    startGlobalProgress(
      t('management.dataManagementModal.actions.checkMigrationTitle'),
      MIGRATION_CHECK_TYPES.length,
      t('management.dataManagementModal.actions.checkMigrationDetail')
    );

    try {
      migrationResults = await runMigrationChecks((current, total, message) => {
        updateSharedProgress(current, total, message);
      });

      const totalIssues = migrationResults.reduce((sum, r) => sum + r.count, 0);
      addLog(t('management.dataManagementModal.logs.migrationCheckDone', { count: totalIssues }));
      finishGlobalProgress('success', t('management.dataManagementModal.actions.checkMigrationSuccess', { count: totalIssues }), MIGRATION_CHECK_TYPES.length, MIGRATION_CHECK_TYPES.length);
    } catch (e) {
      addLog(t('management.dataManagementModal.logs.migrationCheckFailed', { message: String(e) }));
      finishGlobalProgress('error', t('management.dataManagementModal.actions.checkMigrationFailed', { message: String(e) }), progressCurrent, progressTotal || MIGRATION_CHECK_TYPES.length);
    } finally {
      isMigrating = false;
      resetLocalProgress();
    }
  }

  async function handleExecuteMigration() {
    const confirmed = await showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.schemaMigrationConfirm'),
      t('management.dataManagementModal.actions.schemaMigrationConfirmTitle')
    );
    if (!confirmed) {
      addLog(t('management.dataManagementModal.logs.cancelSchemaMigration'));
      return;
    }

    const migrationCheckCount = MIGRATION_CHECK_TYPES.length;
    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.schemaMigrationTitle'),
      startLog: t('management.dataManagementModal.actions.schemaMigrationStartLog'),
      initialDetail: t('management.dataManagementModal.actions.schemaMigrationInitialDetail'),
      totalSteps: 1 + migrationCheckCount,
      run: () => dataService.executeSchemaMigration({ confirmed: true }),
      postRunDetail: t('management.dataManagementModal.actions.schemaMigrationPostRunDetail'),
      afterRun: async () => {
        migrationResults = await runMigrationChecks((current, total, message) => {
          updateSharedProgress(1 + current, 1 + total, message);
        });
      },
      successLog: (result) => t('management.dataManagementModal.actions.schemaMigrationSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.schemaMigrationSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.schemaMigrationErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.schemaMigrationErrorDetailPrefix')
    });
  }

  async function handleExecuteIRPointMigration() {
    const confirmed = await showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.irPointMigrationConfirm'),
      t('management.dataManagementModal.actions.irPointMigrationConfirmTitle')
    );
    if (!confirmed) {
      addLog(t('management.dataManagementModal.logs.cancelIrPointMigration'));
      return;
    }

    const migrationCheckCount = MIGRATION_CHECK_TYPES.length;
    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.irPointMigrationTitle'),
      startLog: t('management.dataManagementModal.actions.irPointMigrationStartLog'),
      initialDetail: t('management.dataManagementModal.actions.irPointMigrationInitialDetail'),
      totalSteps: 1 + migrationCheckCount,
      run: () => dataService.executeIRPointStorageMigration({ confirmed: true }),
      postRunDetail: t('management.dataManagementModal.actions.irPointMigrationPostRunDetail'),
      afterRun: async () => {
        migrationResults = await runMigrationChecks((current, total, message) => {
          updateSharedProgress(1 + current, 1 + total, message);
        });
      },
      successLog: (result) => t('management.dataManagementModal.actions.irPointMigrationSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.irPointMigrationSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.irPointMigrationErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.irPointMigrationErrorDetailPrefix')
    });
  }

  async function handleFixStructure() {
    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.structureFixTitle'),
      startLog: t('management.dataManagementModal.actions.structureFixStartLog'),
      initialDetail: t('management.dataManagementModal.actions.structureFixInitialDetail'),
      totalSteps: 2,
      run: () => dataService.fixStructure(),
      postRunDetail: t('management.dataManagementModal.actions.structureFixPostRunDetail'),
      afterRun: async () => {
        const structureResult = await dataService.checkStructure();
        upsertMigrationResult(structureResult);
        updateSharedProgress(2, 2, t('management.dataManagementModal.actions.structureFixRecheckDone'));
      },
      successLog: (result) => t('management.dataManagementModal.actions.structureFixSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.structureFixSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.structureFixErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.structureFixErrorDetailPrefix')
    });
  }

  async function handleCleanupLegacy() {
    const confirmed = await showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.legacyCleanupConfirm'),
      t('management.dataManagementModal.actions.legacyCleanupConfirmTitle')
    );
    if (!confirmed) {
      addLog(t('management.dataManagementModal.logs.cancelLegacyCleanup'));
      return;
    }

    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.legacyCleanupTitle'),
      startLog: t('management.dataManagementModal.actions.legacyCleanupStartLog'),
      initialDetail: t('management.dataManagementModal.actions.legacyCleanupInitialDetail'),
      totalSteps: 2,
      run: () => dataService.cleanupLegacyDirectories({ allowHighRisk: true }),
      postRunDetail: t('management.dataManagementModal.actions.legacyCleanupPostRunDetail'),
      afterRun: async () => {
        const legacyResult = await dataService.checkLegacyDirectories();
        upsertMigrationResult(legacyResult);
        updateSharedProgress(2, 2, t('management.dataManagementModal.actions.legacyCleanupRecheckDone'));
      },
      successLog: (result) => t('management.dataManagementModal.actions.legacyCleanupSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.legacyCleanupSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.legacyCleanupErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.legacyCleanupErrorDetailPrefix')
    });
  }

  async function handleExecuteQBankMigration() {
    const confirmed = await showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.qbankMigrationConfirm'),
      t('management.dataManagementModal.actions.qbankMigrationConfirmTitle')
    );
    if (!confirmed) {
      addLog(t('management.dataManagementModal.logs.cancelQbankMigration'));
      return;
    }

    const migrationCheckCount = MIGRATION_CHECK_TYPES.length;
    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.qbankMigrationTitle'),
      startLog: t('management.dataManagementModal.actions.qbankMigrationStartLog'),
      initialDetail: t('management.dataManagementModal.actions.qbankMigrationInitialDetail'),
      totalSteps: 1 + migrationCheckCount,
      run: () => dataService.fix('qbank_migration', { allowHighRisk: true }),
      postRunDetail: t('management.dataManagementModal.actions.qbankMigrationPostRunDetail'),
      afterRun: async () => {
        migrationResults = await runMigrationChecks((current, total, message) => {
          updateSharedProgress(1 + current, 1 + total, message);
        });
      },
      successLog: (result) => t('management.dataManagementModal.actions.qbankMigrationSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.qbankMigrationSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.qbankMigrationErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.qbankMigrationErrorDetailPrefix')
    });
  }

  async function handleExecuteQBankLegacyCleanup() {
    const confirmed = await showDangerConfirm(
      plugin.app,
      t('management.dataManagementModal.actions.legacyQbankCleanupConfirm'),
      t('management.dataManagementModal.actions.legacyQbankCleanupConfirmTitle')
    );
    if (!confirmed) {
      addLog(t('management.dataManagementModal.logs.cancelLegacyQbankCleanup'));
      return;
    }

    const migrationCheckCount = MIGRATION_CHECK_TYPES.length;
    await executeTrackedMigrationTask({
      title: t('management.dataManagementModal.actions.legacyQbankCleanupTitle'),
      startLog: t('management.dataManagementModal.actions.legacyQbankCleanupStartLog'),
      initialDetail: t('management.dataManagementModal.actions.legacyQbankCleanupInitialDetail'),
      totalSteps: 1 + migrationCheckCount,
      run: () => dataService.fix('qbank_legacy_cleanup', { allowHighRisk: true }),
      postRunDetail: t('management.dataManagementModal.actions.legacyQbankCleanupPostRunDetail'),
      afterRun: async () => {
        migrationResults = await runMigrationChecks((current, total, message) => {
          updateSharedProgress(1 + current, 1 + total, message);
        });
      },
      successLog: (result) => t('management.dataManagementModal.actions.legacyQbankCleanupSuccessLog', { success: result.success, failed: result.failed }),
      successDetail: (result) => t('management.dataManagementModal.actions.legacyQbankCleanupSuccessDetail', { success: result.success, failed: result.failed }),
      errorLogPrefix: t('management.dataManagementModal.actions.legacyQbankCleanupErrorLogPrefix'),
      errorDetailPrefix: t('management.dataManagementModal.actions.legacyQbankCleanupErrorDetailPrefix')
    });
  }

  function getTypeName(type: CheckType): string {
    return getDataCheckDisplayName(type);
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'ok': return 'status-ok';
      case 'warning': return 'status-warning';
      case 'error': return 'status-error';
      default: return '';
    }
  }

  function getResultCountText(result: DataCheckResult): string {
    return result.count > 0
      ? t('management.dataManagementModal.resultSummary.foundCount', { count: result.count })
      : t('management.dataManagementModal.resultSummary.normal');
  }

  // ===== 质量扫描方法 =====
  // 通过服务层剥离 YAML frontmatter 后再显示内容
  function getCardDisplayContent(card: Card | undefined, maxLen: number = 50): string {
    if (!card) return t('management.dataManagementModal.resultSummary.noContent');
    return CardQualityInboxService.getDisplayContent(card, maxLen);
  }

  function truncateUUID(uuid: string, maxLen: number = 12): string {
    return uuid.length > maxLen ? uuid.slice(0, maxLen) + '...' : uuid;
  }

  function isGroupSelected(group: GroupedIssue): boolean {
    return group.issueIds.every(id => selectedIssues.has(id));
  }

  function toggleGroupSelection(group: GroupedIssue) {
    const allSelected = isGroupSelected(group);
    if (allSelected) {
      group.issueIds.forEach(id => selectedIssues.delete(id));
    } else {
      group.issueIds.forEach(id => selectedIssues.add(id));
    }
    selectedIssues = new Set(selectedIssues);
  }

  function toggleSelectAll() {
    if (scanResult) {
      if (selectedIssues.size === scanResult.issues.length) {
        selectedIssues.clear();
      } else {
        selectedIssues = new Set(scanResult.issues.map(i => i.id));
      }
      selectedIssues = new Set(selectedIssues);
    }
  }

  async function startScan() {
    isScanning = true;
    scanView = 'scanning';
    scanResult = null;
    
    try {
      const service = getCardQualityInboxService(plugin);
      const cardsToScan = scanScope === 'all' ? allCards : cards;
      const result = await service.scanCards(cardsToScan, scanConfig, (progress) => {
        scanProgress = progress;
      });
      
      scanResult = result;
      scanView = 'result';
      
      if (result.issues.length === 0) {
        new Notice(t('management.dataManagementModal.scanNoIssues'));
      } else {
        new Notice(t('management.dataManagementModal.scanIssuesFound', { count: result.issues.length }));
      }
    } catch (error) {
      logger.error('[DataManagement] 扫描失败:', error);
      new Notice(t('management.dataManagementModal.scanFailed', { message: error instanceof Error ? error.message : String(error) }));
      scanView = 'config';
    } finally {
      isScanning = false;
    }
  }

  function rescan() {
    scanView = 'config';
    scanResult = null;
  }

  async function batchIgnoreSelected() {
    if (selectedIssues.size === 0) return;
    if (scanResult) {
      scanResult = {
        ...scanResult,
        issues: scanResult.issues.filter(i => !selectedIssues.has(i.id))
      };
    }
    new Notice(t('management.dataManagementModal.ignoredIssues', { count: selectedIssues.size }));
    selectedIssues.clear();
    selectedIssues = new Set(selectedIssues);
  }


  async function viewCard(cardUuid: string) {
    try {
      const card = await plugin.directFileReader.getCardByUUID(cardUuid);
      if (card) {
        plugin.openViewCardModal(card);
      } else {
        new Notice(t('management.dataManagementModal.cardNotFound'));
      }
    } catch (error) {
      logger.error('[DataManagement] 查看卡片失败:', error);
      new Notice(t('management.dataManagementModal.viewCardFailed'));
    }
  }
  
  // 编辑卡片
  async function editCard(cardUuid: string) {
    try {
      const card = await plugin.directFileReader.getCardByUUID(cardUuid);
      if (card) {
        if (typeof plugin.openEditCardModal === 'function') {
          plugin.openEditCardModal(card);
        } else {
          new Notice(t('management.dataManagementModal.editUnavailable'));
        }
      } else {
        new Notice(t('management.dataManagementModal.cardNotFound'));
      }
    } catch (error) {
      logger.error('[DataManagement] 编辑卡片失败:', error);
      new Notice(t('management.dataManagementModal.editCardFailed'));
    }
  }
  
  // 删除卡片
  async function deleteCard(cardUuid: string) {
    try {
      const card = await plugin.directFileReader.getCardByUUID(cardUuid);
      if (!card) {
        new Notice(t('management.dataManagementModal.cardNotFound'));
        return;
      }
      if (plugin.dataStorage) {
        await deleteMemoryCard(plugin, cardUuid);
        // 从扫描结果中移除该卡片的所有问题
        if (scanResult) {
          scanResult = {
            ...scanResult,
            issues: scanResult.issues.filter(i => i.cardUuid !== cardUuid)
          };
        }
        new Notice(t('management.dataManagementModal.cardDeleted'));
      }
    } catch (error) {
      logger.error('[DataManagement] 删除卡片失败:', error);
      new Notice(t('management.dataManagementModal.deleteCardFailed'));
    }
  }
  
  // 重置筛选
  function resetFilters() {
    filterSeverity = 'all';
    filterType = 'all';
  }

  // 初始化时自动检测
  onMount(() => {
    void handleCheckCurrentTab();
    void refreshLatestMigrationSummary();
  });
</script>

<div class="unified-management-modal">
    <!-- 顶部导航栏：分段标签 + 上下文操作 -->
    <div class="modal-header-bar">
      <div class="modal-context-title">{$tr('management.dataManagementModal.title')}</div>
      <div class="header-actions">
        <button
          class="header-action-btn"
          onclick={handleCheckCurrentTab}
          disabled={isChecking || isFixing || isMigrating}
          title={$tr('management.dataManagementModal.checkCurrentTabTitle')}
        >
          {#if isChecking || isMigrating}
            <EnhancedIcon name="loader" size={14} animation="spin" />
          {:else}
            <EnhancedIcon name="refresh-cw" size={14} />
          {/if}
          <span>{$tr('management.dataManagementModal.checkCurrentTab')}</span>
        </button>
        <button
          class="header-action-btn fix"
          onclick={handleFixCurrentTab}
          disabled={isChecking || isFixing || isMigrating || activeFixableTypes.length === 0}
          title={$tr('management.dataManagementModal.fixCurrentTabTitle')}
        >
          {#if isFixing}
            <EnhancedIcon name="loader" size={14} animation="spin" />
          {:else}
            <EnhancedIcon name="wrench" size={14} />
          {/if}
          <span>{$tr('management.dataManagementModal.fixCurrentTab')}</span>
        </button>
      </div>
    </div>

    <!-- 标签页内容 -->
    <div class="modal-tab-content">
      <div class="data-management-content">
          <!-- 检测状态 -->
          <section class="section">
            <h3 class="section-title">{activeCheckSectionTitle}</h3>
      <div class="check-results">
        {#if activeCheckResults.length === 0 && !isChecking}
          <div class="empty-state">{activeCheckEmptyMessage}</div>
        {/if}

        {#each activeCheckResults as result}
          <div class="check-item {getStatusClass(result.status)}">
            <div class="check-info">
              <div class="check-title-row">
                <span class="check-name">{getTypeName(result.type)}</span>
                <div class="check-badges">
                  <span class={`check-status-pill ${getStatusClass(result.status)}`}>{getResultCountText(result)}</span>
                  <span class={`check-lifecycle-pill ${getLifecycleKind(result.type)}`}>{getLifecycleLabel(result.type)}</span>
                  {#if result.count > 0 && isHighRiskFixType(result.type)}
                    <span class="check-risk-pill">{$tr('management.dataManagementModal.highRisk')}</span>
                  {/if}
                </div>
              </div>
              <span class="check-message">{result.message}</span>
              {#if getLifecycleNote(result.type)}
                <span class="check-note">{getLifecycleNote(result.type)}</span>
              {/if}
              {#if result.items.length > 0 && (result.type === 'filename_compatibility' || result.type === 'sync_conflict_files' || result.type === 'ir_legacy_readable_markdown_migration' || result.type === 'ir_redundant_frontmatter_cleanup')}
                <div class="check-details">
                  {#each result.items.slice(0, 5) as item}
                    <span class="detail-item">{item}</span>
                  {/each}
                  {#if result.items.length > 5}
                    <span class="detail-more">{$tr('management.dataManagementModal.moreItems', { count: result.items.length - 5 })}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="check-actions">
              <EnhancedButton
                variant="ghost"
                size="sm"
                onclick={() => handleCheck(result.type)}
                disabled={isChecking || isFixing}
                tooltip={$tr('management.dataManagementModal.recheck')}
              >
                <EnhancedIcon name="refresh-cw" size={14} />
              </EnhancedButton>
              {#if result.count > 0}
                {#if supportsDirectFix(result.type)}
                  <EnhancedButton
                    variant="ghost"
                    size="sm"
                    onclick={() => handleFix(result.type)}
                    disabled={isChecking || isFixing}
                    tooltip={$tr('management.dataManagementModal.fix')}
                  >
                    <EnhancedIcon name="wrench" size={14} />
                  </EnhancedButton>
                {/if}
              {/if}
            </div>
          </div>
        {/each}

        {#if isChecking || isFixing}
          <div class="batch-progress-container">
            <div class="batch-progress-header">
              <EnhancedIcon name="loader" size={14} animation="spin" />
              <span class="batch-progress-label">{isFixing ? $tr('management.dataManagementModal.fixing') : $tr('management.dataManagementModal.checking')}...</span>
              <span class="batch-progress-count">{progressCurrent}/{progressTotal}</span>
            </div>
            <div class="batch-progress-bar">
              <div class="batch-progress-fill" style="width: {progressPercent}%"></div>
            </div>
            <span class="batch-progress-message">{progressMessage}</span>
          </div>
        {/if}
            </div>
          </section>

          <!-- 数据迁移与结构核对 -->
          <section class="section">
            <h3 class="section-title">{activeMigrationSectionTitle}</h3>
            <div class="migration-actions">
              <EnhancedButton
                variant="secondary"
                size="sm"
                onclick={handleCheckMigration}
                disabled={isMigrating || isChecking || isFixing}
              >
                {#if isMigrating}
                  <EnhancedIcon name="loader" size={14} animation="spin" />
                {:else}
                  <EnhancedIcon name="folder-search" size={14} />
                {/if}
                {activeMigrationActionLabel}
              </EnhancedButton>
            </div>
            {#if latestMigrationSummary}
              <div class="check-item latest-migration-summary">
                <div class="check-info">
                  <span class="check-name">{$tr('management.dataManagementModal.latestMigrationReport')}</span>
                  <span class="check-message">{$tr('management.dataManagementModal.targetPath', { path: latestMigrationSummary.targetRoot })}</span>
                  <div class="check-details">
                    <span class="detail-item">{$tr('management.dataManagementModal.movedFiles', { count: latestMigrationSummary.movedFiles })}</span>
                    <span class="detail-item">{$tr('management.dataManagementModal.conflicts', { count: latestMigrationSummary.conflicts })}</span>
                    <span class="detail-item">{$tr('management.dataManagementModal.rewrittenRefs', { count: latestMigrationSummary.rewrittenReferences })}</span>
                    <span class="detail-item">{$tr('management.dataManagementModal.remainingLegacyRoots', { count: latestMigrationSummary.remainingLegacyRoots })}</span>
                    <span class="detail-item">{$tr('management.dataManagementModal.reportTime', { time: latestMigrationSummary.reportTime })}</span>
                  </div>
                </div>
              </div>
            {/if}
            <div class="check-results">
              {#if activeMigrationResults.length === 0 && !isMigrating}
                <div class="empty-state">{activeMigrationEmptyMessage}</div>
              {/if}
              {#each activeMigrationResults as result}
                <div class="check-item {getStatusClass(result.status)}">
                  <div class="check-info">
                    <div class="check-title-row">
                      <span class="check-name">{getTypeName(result.type)}</span>
                      <div class="check-badges">
                        <span class={`check-status-pill ${getStatusClass(result.status)}`}>{getResultCountText(result)}</span>
                        <span class={`check-lifecycle-pill ${getLifecycleKind(result.type)}`}>{getLifecycleLabel(result.type)}</span>
                        {#if result.count > 0 && isHighRiskFixType(result.type)}
                          <span class="check-risk-pill">{$tr('management.dataManagementModal.highRisk')}</span>
                        {/if}
                      </div>
                    </div>
                    <span class="check-message">{result.message}</span>
                    {#if getLifecycleNote(result.type)}
                      <span class="check-note">{getLifecycleNote(result.type)}</span>
                    {/if}
                    {#if result.items.length > 0 && (result.type === 'legacy_cleanup' || result.type === 'migration_conflict_files' || result.type === 'ir_point_storage_migration' || result.type === 'ir_legacy_readable_markdown_migration' || result.type === 'ir_local_state_relocation' || result.type === 'ir_legacy_bookmark_cleanup')}
                      <div class="check-details">
                        {#each result.items.slice(0, 3) as item}
                          <span class="detail-item">{item}</span>
                        {/each}
                        {#if result.items.length > 3}
                          <span class="detail-more">{$tr('management.dataManagementModal.moreItems', { count: result.items.length - 3 })}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <div class="check-actions">
                    {#if result.type === 'schema_migration' && result.count > 0}
                      <EnhancedButton
                        variant="primary"
                        size="sm"
                        onclick={handleExecuteMigration}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.runMigration')}
                      >
                        <EnhancedIcon name="play" size={14} />
                        {$tr('management.dataManagementModal.runMigration')}
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'ir_point_storage_migration' && result.count > 0}
                      <EnhancedButton
                        variant="primary"
                        size="sm"
                        onclick={handleExecuteIRPointMigration}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.migrateIrPointStorage')}
                      >
                        <EnhancedIcon name="play" size={14} />
                        {$tr('management.dataManagementModal.migrateIrPointStorage')}
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'ir_legacy_readable_markdown_migration' && result.count > 0}
                      <EnhancedButton
                        variant="primary"
                        size="sm"
                        onclick={() => handleFix(result.type)}
                        disabled={isMigrating || isFixing}
                        tooltip={$tr('management.dataManagementModal.migrateLegacyIrMarkdown')}
                      >
                        <EnhancedIcon name="folder-output" size={14} />
                        {$tr('management.dataManagementModal.migrateLegacyIrMarkdown')}
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'qbank_migration' && result.status !== 'error' && result.count > 0}
                      <EnhancedButton
                        variant="primary"
                        size="sm"
                        onclick={handleExecuteQBankMigration}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.migrateQbank')}
                      >
                        <EnhancedIcon name="play" size={14} />
                        .qbank
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'qbank_legacy_cleanup' && result.status !== 'error' && result.count > 0}
                      <EnhancedButton
                        variant="danger"
                        size="sm"
                        onclick={handleExecuteQBankLegacyCleanup}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.cleanupLegacyQbank')}
                      >
                        <EnhancedIcon name="trash-2" size={14} />
                        {$tr('management.dataManagementModal.cleanupLegacyQbank')}
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'ir_local_state_relocation' && result.count > 0}
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onclick={() => handleFix(result.type)}
                        disabled={isMigrating || isFixing}
                        tooltip={$tr('management.dataManagementModal.migrateIrLocalState')}
                      >
                        <EnhancedIcon name="folder-output" size={14} />
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'structure_check' && result.count > 0}
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onclick={handleFixStructure}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.createMissingDirs')}
                      >
                        <EnhancedIcon name="folder-plus" size={14} />
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'legacy_cleanup' && result.count > 0}
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onclick={handleCleanupLegacy}
                        disabled={isMigrating}
                        tooltip={$tr('management.dataManagementModal.cleanupLegacyDirs')}
                      >
                        <EnhancedIcon name="trash-2" size={14} />
                      </EnhancedButton>
                    {/if}
                    {#if result.type === 'migration_conflict_files' && result.count > 0}
                      <EnhancedButton
                        variant="ghost"
                        size="sm"
                        onclick={() => handleFix(result.type)}
                        disabled={isMigrating || isFixing}
                        tooltip={$tr('management.dataManagementModal.resolveMigrationConflicts')}
                      >
                        <EnhancedIcon name="wrench" size={14} />
                      </EnhancedButton>
                    {/if}
                  </div>
                </div>
              {/each}

              {#if isMigrating}
                <div class="progress-indicator">
                  <EnhancedIcon name="loader" size={16} animation="spin" />
                  <span>{$tr('management.dataManagementModal.processing')}</span>
                </div>
              {/if}
            </div>
          </section>

          <!-- 操作日志 -->
          <section class="section">
            <h3 class="section-title">{$tr('management.dataManagementModal.logTitle')}</h3>
            <div class="log-container">
              {#each logs as log}
                <div class="log-item">{log}</div>
              {/each}
              {#if logs.length === 0}
                <div class="empty-state">{$tr('management.dataManagementModal.noLogs')}</div>
              {/if}
            </div>
          </section>
      </div>
    </div>
  </div>

<style>
  .unified-management-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
  }

  .modal-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    gap: 12px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent),
      var(--background-primary);
  }

  .modal-context-title {
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-normal);
    min-width: 0;
    flex: 1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--interactive-normal);
    color: var(--text-normal);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .header-action-btn:hover:not(:disabled) {
    background: var(--interactive-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .header-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .header-action-btn.fix {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .header-action-btn.fix:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
    border-color: var(--interactive-accent-hover);
  }

  .modal-tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .data-management-content {
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .quality-scan-content {
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .scan-info {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent), var(--background-secondary-alt, var(--background-secondary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    font-size: 13px;
  }

  .scan-scope-area {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .scope-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    font-size: 13px;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }

  .scope-option:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent), var(--background-secondary-alt, var(--background-secondary));
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-title::before {
    content: '';
    width: 4px;
    height: 15px;
    border-radius: 999px;
    background: var(--interactive-accent);
    opacity: 0.85;
  }

  .check-results {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 13px 14px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    transition: border-color 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
  }

  .check-item:hover {
    border-color: var(--background-modifier-border-hover);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-modifier-hover));
  }

  .check-item.latest-migration-summary {
    background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));
  }

  .check-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .check-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .check-name {
    font-weight: 650;
    font-size: 0.92rem;
    color: var(--text-normal);
  }

  .check-message {
    font-size: 0.79rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .check-note {
    font-size: 0.74rem;
    color: var(--text-faint);
    line-height: 1.45;
  }

  .check-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .check-status-pill,
  .check-lifecycle-pill,
  .check-risk-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .check-status-pill.status-ok {
    background: rgba(34, 197, 94, 0.1);
    color: rgb(21, 128, 61);
    border-color: rgba(34, 197, 94, 0.16);
  }

  .check-status-pill.status-warning {
    background: rgba(245, 158, 11, 0.12);
    color: rgb(180, 83, 9);
    border-color: rgba(245, 158, 11, 0.18);
  }

  .check-status-pill.status-error {
    background: rgba(239, 68, 68, 0.12);
    color: rgb(185, 28, 28);
    border-color: rgba(239, 68, 68, 0.18);
  }

  .check-lifecycle-pill.long_term {
    background: rgba(59, 130, 246, 0.12);
    color: rgb(29, 78, 216);
    border-color: rgba(59, 130, 246, 0.18);
  }

  .check-lifecycle-pill.temporary {
    background: rgba(107, 114, 128, 0.12);
    color: var(--text-muted);
    border-color: rgba(107, 114, 128, 0.18);
  }

  .check-risk-pill {
    background: rgba(168, 85, 247, 0.12);
    color: rgb(126, 34, 206);
    border-color: rgba(168, 85, 247, 0.18);
  }

  .check-actions {
    display: flex;
    gap: 6px;
    align-self: flex-start;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .batch-progress-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: var(--background-primary);
    border-radius: 14px;
    border: 1px solid var(--background-modifier-border);
  }

  .batch-progress-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-normal);
  }

  .batch-progress-label {
    font-weight: 500;
  }

  .batch-progress-count {
    margin-left: auto;
    font-family: var(--font-monospace);
    font-size: 12px;
    color: var(--text-muted);
  }

  .batch-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .batch-progress-fill {
    height: 100%;
    background: var(--interactive-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .batch-progress-message {
    font-size: 12px;
    color: var(--text-muted);
  }


  .log-container {
    max-height: 150px;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    padding: 10px 14px;
    font-family: var(--font-monospace);
    font-size: 11px;
  }

  .log-item {
    padding: 4px 0;
    color: var(--text-muted);
    border-bottom: 1px dashed rgba(128, 128, 128, 0.12);
  }

  .log-item:last-child {
    border-bottom: none;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ===== 质量扫描样式 ===== */
  .config-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent), var(--background-secondary-alt, var(--background-secondary));
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .config-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 10px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .config-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slider-value {
    min-width: 50px;
    text-align: right;
    font-weight: 600;
    color: var(--text-accent);
  }

  .hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.45;
  }

  .action-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .scanning-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    flex: 1;
    min-height: 200px;
    padding: 24px;
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent), var(--background-secondary-alt, var(--background-secondary));
  }

  .scan-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .progress-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 400px;
  }

  .phase-text {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--background-secondary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
  }

  .result-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 14px 16px;
    background: var(--background-secondary-alt, var(--background-secondary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    min-width: 0;
  }

  .summary-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .summary-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1;
  }

  .summary-value.has-issues {
    color: var(--color-red);
  }

  .summary-item.error .summary-value {
    color: var(--color-red);
  }

  .summary-item.warning .summary-value {
    color: var(--color-yellow);
  }

  .no-issues {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    color: var(--color-green);
    min-height: 150px;
  }

  .issues-table-container {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: var(--background-secondary-alt, var(--background-secondary));
    max-height: 300px;
  }

  .issues-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .col-checkbox { width: 40px; text-align: center; }
  .col-id { width: 120px; }
  .col-content { min-width: 200px; }
  .col-issue { width: 150px; }
  .col-action { width: 100px; text-align: center; }

  .uuid-text {
    font-family: var(--font-monospace);
    font-size: 12px;
    color: var(--text-muted);
  }

  .content-text {
    color: var(--text-normal);
    display: block;
    max-width: 250px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .issue-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .issue-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-normal);
    white-space: nowrap;
  }

  .view-card-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .view-card-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-accent);
  }

  .delete-btn:hover {
    color: var(--color-red);
  }

  .action-btn-group {
    display: flex;
    gap: 2px;
  }

  /* info 级别摘要颜色 */
  .summary-item.info .summary-value {
    color: var(--color-blue);
  }

  /* 筛选栏 */
  .scan-filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    flex-wrap: wrap;
    background: var(--background-secondary-alt, var(--background-secondary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
  }

  .scan-filter-select {
    min-height: 32px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 12px;
  }

  .scan-filter-reset {
    min-height: 32px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .scan-filter-reset:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .scan-filter-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }

  /* 长度阈值配置 */
  .threshold-row {
    display: flex;
    gap: 16px;
  }

  .threshold-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-normal);
  }

  .threshold-input {
    width: 80px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .result-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .action-spacer {
    flex: 1;
  }

  /* 迁移相关样式 */
  .migration-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }

  .check-details {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .detail-item {
    font-size: 11px;
    padding: 4px 8px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    color: var(--text-muted);
    font-family: var(--font-monospace);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-more {
    font-size: 11px;
    color: var(--text-faint);
    font-style: italic;
  }

  /* ==================== 移动端适配 ==================== */

  /* 顶部导航栏：换行为两行，tabs上 actions下 */
  :global(body.is-mobile) .modal-header-bar {
    flex-wrap: wrap;
    padding: 12px 14px;
    gap: 8px;
  }

  :global(body.is-mobile) .segmented-tabs {
    flex: 1 1 100%;
  }

  :global(body.is-mobile) .seg-tab {
    flex: 1;
    justify-content: center;
    padding: 8px 10px;
    min-height: 36px;
  }

  /* 操作按钮：隐藏文字只保留图标，增大触控区域 */
  :global(body.is-mobile) .header-actions {
    margin-left: auto;
    gap: 8px;
  }

  :global(body.is-mobile) .header-action-btn {
    padding: 8px 12px;
    min-height: 36px;
    min-width: 36px;
    justify-content: center;
  }

  :global(body.is-mobile) .header-action-btn span {
    display: none;
  }

  /* 内容区间距 */
  :global(body.is-mobile) .data-management-content,
  :global(body.is-mobile) .quality-scan-content {
    padding: 12px;
    gap: 12px;
  }

  :global(body.is-mobile) .section,
  :global(body.is-mobile) .config-section {
    padding: 14px;
  }

  /* 检测项：垂直堆叠 info 和 actions */
  :global(body.is-mobile) .check-item {
    flex-wrap: wrap;
    padding: 12px;
    gap: 8px;
  }

  :global(body.is-mobile) .check-info {
    flex: 1 1 0;
    min-width: 0;
  }

  :global(body.is-mobile) .check-name {
    font-size: 12px;
  }

  :global(body.is-mobile) .check-message {
    font-size: 11px;
    word-break: break-all;
  }

  :global(body.is-mobile) .check-actions {
    margin-left: auto;
    gap: 6px;
  }

  :global(body.is-mobile) .check-title-row {
    gap: 8px;
  }

  /* 迁移按钮 */
  :global(body.is-mobile) .migration-actions {
    margin-bottom: 8px;
  }

  /* 日志区域 */
  :global(body.is-mobile) .log-container {
    max-height: 120px;
    padding: 8px 10px;
    font-size: 10px;
  }

  /* 进度条 */
  :global(body.is-mobile) .batch-progress-container {
    padding: 10px;
  }

  :global(body.is-mobile) .batch-progress-header {
    font-size: 12px;
  }

  :global(body.is-mobile) .result-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
</style>
