import { logger } from "../utils/logger";
/**
 * 平板端调试和测试工具
 * 用于在开发环境中模拟和测试平板端功能
 */

import { type DeviceInfo, detectDevice } from "./tablet-detection";

export interface TabletDebugConfig {
	enabled: boolean;
	mockDevice?: Partial<DeviceInfo>;
	showDebugInfo: boolean;
	logDeviceChanges: boolean;
	enableTouchSimulation: boolean;
}

type TabletDebugApi = {
	enable: () => void;
	disable: () => void;
	mockiPad: () => void;
	mockAndroid: () => void;
	mockMobile: () => void;
	restore: () => void;
	stats: () => ReturnType<TabletDebugger["getStats"]>;
	landscape: () => void;
	portrait: () => void;
};

type TabletDebugWindow = Window &
	typeof globalThis & {
		__weave_detectDevice?: (() => DeviceInfo) | undefined;
		__weaveTabletDebugCleanup?: (() => void) | undefined;
		weaveTabletDebug?: TabletDebugApi | undefined;
	};

class TabletDebugger {
	private config: TabletDebugConfig = {
		enabled: false,
		showDebugInfo: false,
		logDeviceChanges: false,
		enableTouchSimulation: false,
	};

	private debugOverlay: HTMLElement | null = null;
	private originalDeviceInfo: DeviceInfo | null = null;
	private resizeDebugHandler: (() => void) | null = null;
	private orientationDebugHandler: (() => void) | null = null;
	private touchSimulationMouseDownHandler: ((event: MouseEvent) => void) | null = null;
	private isGlobalApiRegistered = false;

	/**
	 * 启用平板端调试模式
	 */
	enable(config: Partial<TabletDebugConfig> = {}): void {
		this.config = { ...this.config, enabled: true, ...config };
		this.initializeGlobalBindings();

		// 禁用自动显示调试信息浮窗，需要时手动调用
		if (this.config.showDebugInfo && config.showDebugInfo !== undefined) {
			this.createDebugOverlay();
		} else if (!this.config.showDebugInfo) {
			this.removeDebugOverlay();
		}

		if (this.config.logDeviceChanges) {
			this.setupDeviceLogging();
		} else {
			this.teardownDeviceLogging();
		}

		if (this.config.enableTouchSimulation) {
			this.setupTouchSimulation();
		} else {
			this.teardownTouchSimulation();
		}

		logger.debug("[TabletDebugger] 调试模式已启用", this.config);
	}

	/**
	 * 禁用调试模式
	 */
	disable(): void {
		this.config = {
			...this.config,
			enabled: false,
			showDebugInfo: false,
			logDeviceChanges: false,
			enableTouchSimulation: false,
		};
		this.removeDebugOverlay();
		this.teardownDeviceLogging();
		this.teardownTouchSimulation();
		this.restoreDevice();

		logger.debug("[TabletDebugger] 调试模式已禁用");
	}

	destroy(): void {
		this.disable();
		this.unregisterGlobalBindings();
		this.originalDeviceInfo = null;
	}

	/**
	 * 模拟特定设备
	 */
	mockDevice(deviceInfo: Partial<DeviceInfo>): void {
		if (!this.originalDeviceInfo) {
			this.originalDeviceInfo = detectDevice();
		}

		// 重写设备检测函数
		const mockDetectDevice = () => ({
			...this.originalDeviceInfo!,
			...deviceInfo,
		});

		// 替换全局设备检测函数
		(window as any).__weave_detectDevice = mockDetectDevice;

		logger.debug("[TabletDebugger] 设备模拟已启用", deviceInfo);
		this.updateDebugOverlay();
	}

	/**
	 * 恢复真实设备检测
	 */
	restoreDevice(): void {
		const debugWindow = window as TabletDebugWindow;
		debugWindow.__weave_detectDevice = undefined;
		logger.debug("[TabletDebugger] 已恢复真实设备检测");
		this.updateDebugOverlay();
	}

	/**
	 * 模拟方向变化
	 */
	simulateOrientationChange(orientation: "portrait" | "landscape"): void {
		const event = new CustomEvent("orientationchange", {
			detail: { orientation },
		});
		window.dispatchEvent(event);

		// 同时触发resize事件
		window.dispatchEvent(new Event("resize"));

		logger.debug("[TabletDebugger] 模拟方向变化:", orientation);
	}

	/**
	 * 创建调试信息覆盖层
	 */
	private createDebugOverlay(): void {
		if (this.debugOverlay) return;

		this.debugOverlay = document.createElement("div");
		this.debugOverlay.id = "weave-tablet-debug";
		this.debugOverlay.className = "weave-tablet-debug";

		document.body.appendChild(this.debugOverlay);
		this.updateDebugOverlay();
	}

	/**
	 * 更新调试信息
	 */
	private updateDebugOverlay(): void {
		if (!this.debugOverlay) return;

		const debugWindow = window as TabletDebugWindow;
		const deviceInfo = debugWindow.__weave_detectDevice?.() || detectDevice();
		const screenInfo = {
			width: window.innerWidth,
			height: window.innerHeight,
			ratio: window.devicePixelRatio,
		};
		const interactionInfo = {
			touchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
			coarsePointer:
				typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
		};
		const fragment = document.createDocumentFragment();
		const appendLine = (text: string, className?: string): void => {
			const line = document.createElement("div");
			if (className) {
				line.className = className;
			}
			line.textContent = text;
			fragment.appendChild(line);
		};
		const appendTitle = (text: string): void => {
			const line = document.createElement("div");
			const strong = document.createElement("strong");
			strong.textContent = text;
			line.appendChild(strong);
			fragment.appendChild(line);
		};

		appendTitle("设备信息");
		appendLine(
			`类型: ${deviceInfo.isTablet ? "Tablet" : deviceInfo.isMobile ? "Mobile" : "Desktop"}`
		);
		appendLine(`触控: ${deviceInfo.isTouch ? "Yes" : "No"}`);
		appendLine(`方向: ${deviceInfo.orientation}`);
		appendLine(`尺寸: ${deviceInfo.screenSize}`);
		appendLine(`平台: ${deviceInfo.platform}`);
		appendTitle("屏幕信息");
		appendLine(`分辨率: ${screenInfo.width}x${screenInfo.height}`);
		appendLine(`像素比: ${screenInfo.ratio}`);
		appendLine(`Touch Points: ${interactionInfo.touchPoints}`);
		appendLine(`Coarse Pointer: ${interactionInfo.coarsePointer ? "Yes" : "No"}`);

		if (this.config.mockDevice) {
			appendLine("Mock device enabled", "weave-tablet-debug__mock");
			/*
      appendLine('设备模拟中', 'weave-tablet-debug__mock');
    }

      */
		}

		this.debugOverlay.replaceChildren(fragment);
		/*

    // /skip legacyHTML is used for debug overlay with trusted internal device info (dev tool only)
    this.debugOverlay.legacyHTML = `
      <div><strong>🖥️ 设备信息</strong></div>
      <div>类型: ${deviceInfo.isTablet ? 'Tablet' : deviceInfo.isMobile ? 'Mobile' : 'Desktop'}</div>
      <div>触控: ${deviceInfo.isTouch ? 'Yes' : 'No'}</div>
      <div>方向: ${deviceInfo.orientation}</div>
      <div>尺寸: ${deviceInfo.screenSize}</div>
      <div>平台: ${deviceInfo.platform}</div>
      <div><strong>📱 屏幕信息</strong></div>
      <div>分辨率: ${screenInfo.width}x${screenInfo.height}</div>
      <div>像素比: ${screenInfo.ratio}</div>
      <div>Touch Points: ${interactionInfo.touchPoints}</div>
      <div>Coarse Pointer: ${interactionInfo.coarsePointer ? 'Yes' : 'No'}</div>
      ${this.config.mockDevice ? '<div class="weave-tablet-debug__mock">⚠️ 设备模拟中</div>' : ''}
    `;
    */
	}

	/**
	 * 移除调试覆盖层
	 */
	private removeDebugOverlay(): void {
		if (this.debugOverlay) {
			this.debugOverlay.remove();
			this.debugOverlay = null;
		}
	}

	/**
	 * 设置设备变化日志
	 */
	private setupDeviceLogging(): void {
		if (this.resizeDebugHandler || this.orientationDebugHandler) {
			return;
		}

		this.resizeDebugHandler = () => {
			logger.debug("[TabletDebugger] resize", this.getStats());
			this.updateDebugOverlay();
		};
		this.orientationDebugHandler = () => {
			logger.debug("[TabletDebugger] orientationchange", this.getStats());
			this.updateDebugOverlay();
		};

		window.addEventListener("resize", this.resizeDebugHandler);
		window.addEventListener("orientationchange", this.orientationDebugHandler);
	}

	private teardownDeviceLogging(): void {
		if (this.resizeDebugHandler) {
			window.removeEventListener("resize", this.resizeDebugHandler);
			this.resizeDebugHandler = null;
		}
		if (this.orientationDebugHandler) {
			window.removeEventListener("orientationchange", this.orientationDebugHandler);
			this.orientationDebugHandler = null;
		}
	}

	/**
	 * 设置触控模拟
	 */
	private setupTouchSimulation(): void {
		if (this.touchSimulationMouseDownHandler) {
			return;
		}

		this.touchSimulationMouseDownHandler = (e: MouseEvent) => {
			const touchEvent = new TouchEvent("touchstart", {
				touches: [
					new Touch({
						identifier: 0,
						target: e.target as Element,
						clientX: e.clientX,
						clientY: e.clientY,
						radiusX: 20,
						radiusY: 20,
						rotationAngle: 0,
						force: 1,
					}),
				],
			});
			e.target?.dispatchEvent(touchEvent);
		};

		document.addEventListener("mousedown", this.touchSimulationMouseDownHandler);

		logger.debug("[TabletDebugger] 触控模拟已启用");
	}

	private teardownTouchSimulation(): void {
		if (!this.touchSimulationMouseDownHandler) {
			return;
		}

		document.removeEventListener("mousedown", this.touchSimulationMouseDownHandler);
		this.touchSimulationMouseDownHandler = null;
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): TabletDebugConfig {
		return { ...this.config };
	}

	/**
	 * 获取调试统计信息
	 */
	getStats(): {
		currentDevice: DeviceInfo;
		isMocked: boolean;
		screenInfo: any;
		capabilities: any;
	} {
		const debugWindow = window as TabletDebugWindow;
		return {
			currentDevice: debugWindow.__weave_detectDevice?.() || detectDevice(),
			isMocked: !!debugWindow.__weave_detectDevice,
			screenInfo: {
				width: window.innerWidth,
				height: window.innerHeight,
				ratio: window.devicePixelRatio,
				available: {
					width: screen.availWidth,
					height: screen.availHeight,
				},
			},
			capabilities: {
				touch: "ontouchstart" in window,
				multiTouch: navigator.maxTouchPoints,
				hover: window.matchMedia("(hover: hover)").matches,
				pointerEvents: "onpointerdown" in window,
			},
		};
	}

	initializeGlobalBindings(): void {
		if (this.isGlobalApiRegistered) {
			return;
		}

		const debugWindow = window as TabletDebugWindow;
		debugWindow.weaveTabletDebug = {
			enable: () => this.enable({ showDebugInfo: true, logDeviceChanges: true }),
			disable: () => this.disable(),
			mockiPad: () => this.mockDevice(testDevicePresets.iPad),
			mockAndroid: () => this.mockDevice(testDevicePresets.AndroidTablet),
			mockMobile: () => this.mockDevice(testDevicePresets.iPhone),
			restore: () => this.restoreDevice(),
			stats: () => this.getStats(),
			landscape: () => this.simulateOrientationChange("landscape"),
			portrait: () => this.simulateOrientationChange("portrait"),
		};
		debugWindow.__weaveTabletDebugCleanup = () => {
			this.destroy();
		};
		this.isGlobalApiRegistered = true;
	}

	private unregisterGlobalBindings(): void {
		if (!this.isGlobalApiRegistered) {
			return;
		}

		const debugWindow = window as TabletDebugWindow;
		debugWindow.weaveTabletDebug = undefined;
		debugWindow.__weaveTabletDebugCleanup = undefined;
		this.isGlobalApiRegistered = false;
	}
}

// 全局调试器实例
export const tabletDebugger = new TabletDebugger();

/**
 * 预设的测试设备配置
 */
export const testDevicePresets = {
	iPad: {
		isTablet: true,
		isMobile: false,
		isDesktop: false,
		isTouch: true,
		orientation: "portrait" as const,
		screenSize: "medium" as const,
		platform: "ios" as const,
	},
	AndroidTablet: {
		isTablet: true,
		isMobile: false,
		isDesktop: false,
		isTouch: true,
		orientation: "landscape" as const,
		screenSize: "medium" as const,
		platform: "android" as const,
	},
	iPhone: {
		isTablet: false,
		isMobile: true,
		isDesktop: false,
		isTouch: true,
		orientation: "portrait" as const,
		screenSize: "small" as const,
		platform: "ios" as const,
	},
	Desktop: {
		isTablet: false,
		isMobile: false,
		isDesktop: true,
		isTouch: false,
		orientation: "landscape" as const,
		screenSize: "large" as const,
		platform: "windows" as const,
	},
} as const;

export function initializeGlobalTabletDebugTools(): void {
	tabletDebugger.initializeGlobalBindings();
}
