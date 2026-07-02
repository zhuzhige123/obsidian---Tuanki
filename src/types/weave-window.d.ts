export {};

/** Weave runtime singletons attached to `window` (HMR-safe globals). */
declare global {
	interface Window {
		__weaveUnifiedErrorHandler?: import("../utils/unified-error-handler").UnifiedErrorHandler | null;
		__weaveUnifiedErrorHandlerCleanup?: (() => void) | null;

		__weaveMemoryManager?: import("../utils/memoryManager").ResourceReferenceManager | null;
		__weaveMemoryMonitor?: import("../utils/memoryManager").MemoryMonitor | null;
		__weaveMemoryManagerCleanup?: (() => void) | null;

		__weaveThemeManager?: import("../utils/theme-detection").UnifiedThemeManager | null;
		__weaveThemeManagerCleanup?: (() => void) | null;

		__weaveSmartCacheService?: import("../utils/smart-cache").SmartCacheService | null;
		__weaveSmartCacheServiceCleanup?: (() => void) | null;

		__weaveCacheManager?: import("../utils/cache-manager").CacheManager | null;
		__weaveCacheManagerCleanup?: (() => void) | null;

		__weaveAdaptiveCacheService?: import("../utils/adaptive-cache").AdaptiveCacheService | null;
		__weaveAdaptiveCacheServiceCleanup?: (() => void) | null;

		__weaveGlobalPerformanceMonitor?: import("../utils/parsing-performance-monitor").SystemPerformanceMonitor | null;
		__weaveGlobalPerformanceMonitorCleanup?: (() => void) | null;

		__weaveEnhancedPerformanceMonitor?: import("../utils/enhanced-performance-monitor").EnhancedPerformanceMonitor | null;
		__weaveEnhancedPerformanceMonitorCleanup?: (() => void) | null;

		__weaveConfigPerformanceMonitor?: import("../config/performance").PerformanceMonitor | null;
		__weaveConfigPerformanceMonitorCleanup?: (() => void) | null;

		__weaveServicePerformanceMonitor?: unknown;
		__weaveServicePerformanceMonitorCleanup?: (() => void) | null;

		__weaveFocusManager?: import("../utils/focus-manager").FocusManager | null;
		__weaveFocusManagerCleanup?: (() => void) | null;

		__weaveGlobalStateManager?: import("../stores/unified-state-manager").UnifiedStateManager | null;
		__weaveGlobalStateManagerCleanup?: (() => void) | null;
		__weaveGlobalPersistenceManager?: import("../stores/unified-state-manager").StatePersistenceManager | null;
		__weaveGlobalPersistenceManagerCleanup?: (() => void) | null;

		__weaveTabletDebugCleanup?: (() => void) | null;
		__weaveMobileModalAdaptationCleanup?: (() => void) | null;
		__weaveGlobalErrorReporterCleanup?: (() => void) | null;

		weaveDeviceInfo?: unknown;
		__weave_detectDevice?: () => import("../utils/tablet-detection").DeviceInfo;
	}

	interface WindowEventMap {
		"Weave:open-activation": CustomEvent;
	}
}
