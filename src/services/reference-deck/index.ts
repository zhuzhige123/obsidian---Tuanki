/**
 * 引用式牌组系统服务导出
 *
 * 包含：
 * - DataConsistencyService: 数据一致性检查
 * - ReferenceMigrationService: 数据迁移
 */

export {
	DataConsistencyService,
	getDataConsistencyService,
	initDataConsistencyService,
	type RepairResult,
} from "./DataConsistencyService";

export {
	ReferenceMigrationService,
	getReferenceMigrationService,
	initReferenceMigrationService,
	type MigrationOptions,
} from "./ReferenceMigrationService";
