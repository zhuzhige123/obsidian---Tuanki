import echarts, { type EChartsOption, type EChartsType } from "./echarts-loader";
import { getThemeColors, type ThemeColors } from "./echarts-theme";
import { bindPinchRangeGesture } from "./pinch-range-gesture";

interface ChartRangeInteraction {
	onWheelStep?: (step: number) => void;
	onPinchStep?: (step: number) => void;
	cooldownMs?: number;
	enabled?: () => boolean;
}

export interface ChartRuntimeOptions<TPayload> {
	buildOption: (
		payload: TPayload,
		theme: ThemeColors,
		chart: EChartsType
	) => EChartsOption | undefined;
	onRendered?: (chart: EChartsType, payload: TPayload, theme: ThemeColors) => void;
	rangeInteraction?: ChartRangeInteraction;
	replaceOption?: boolean;
}

export interface ManagedChartRuntime<TPayload> {
	setContainer: (container: HTMLElement | null) => void;
	render: (payload: TPayload) => void;
	resize: () => void;
	dispose: () => void;
	getChart: () => EChartsType | null;
}

export function createManagedChartRuntime<TPayload>(
	options: ChartRuntimeOptions<TPayload>
): ManagedChartRuntime<TPayload> {
	let container: HTMLElement | null = null;
	let chart: EChartsType | null = null;
	let latestPayload: TPayload | null = null;
	let themeObserver: MutationObserver | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let pinchCleanup: (() => void) | null = null;
	let wheelCooldown = false;

	const cooldownMs = Math.max(120, options.rangeInteraction?.cooldownMs ?? 180);

	const isRangeInteractionEnabled = () => options.rangeInteraction?.enabled?.() ?? true;

	const ensureChart = (): EChartsType | null => {
		if (!container) {
			return null;
		}

		if (chart && chart.getDom() !== container) {
			chart.dispose();
			chart = null;
		}

		if (!chart) {
			chart = echarts.init(container);
		}

		return chart;
	};

	const clearRangeInteraction = () => {
		container?.removeEventListener("wheel", handleWheel);
		pinchCleanup?.();
		pinchCleanup = null;
	};

	const renderLatest = () => {
		if (latestPayload === null) {
			return;
		}

		const instance = ensureChart();
		if (!instance) {
			return;
		}

		const theme = getThemeColors();
		const nextOption = options.buildOption(latestPayload, theme, instance);
		if (!nextOption) {
			return;
		}

		instance.setOption(nextOption, options.replaceOption ?? true);
		options.onRendered?.(instance, latestPayload, theme);
		instance.resize();
	};

	const handleWheel = (event: WheelEvent) => {
		if (!options.rangeInteraction?.onWheelStep || !isRangeInteractionEnabled()) {
			return;
		}

		event.preventDefault();
		if (wheelCooldown) {
			return;
		}

		wheelCooldown = true;
		options.rangeInteraction.onWheelStep(event.deltaY < 0 ? 1 : -1);
		window.setTimeout(() => {
			wheelCooldown = false;
		}, cooldownMs);
	};

	const bindRangeInteraction = () => {
		clearRangeInteraction();
		if (!container || !options.rangeInteraction || !isRangeInteractionEnabled()) {
			return;
		}

		if (options.rangeInteraction.onWheelStep) {
			container.addEventListener("wheel", handleWheel, { passive: false });
		}

		if (options.rangeInteraction.onPinchStep) {
			pinchCleanup = bindPinchRangeGesture(container, {
				onExpand: () => {
					if (!isRangeInteractionEnabled()) return;
					options.rangeInteraction?.onPinchStep?.(-1);
				},
				onContract: () => {
					if (!isRangeInteractionEnabled()) return;
					options.rangeInteraction?.onPinchStep?.(1);
				},
				cooldownMs,
			});
		}
	};

	const ensureObservers = () => {
		if (!themeObserver) {
			themeObserver = new MutationObserver(() => {
				renderLatest();
			});
			themeObserver.observe(activeDocument.body, {
				attributes: true,
				attributeFilter: ["class"],
			});
		}

		if (container) {
			resizeObserver?.disconnect();
			resizeObserver = new ResizeObserver(() => {
				chart?.resize();
			});
			resizeObserver.observe(container);
		}
	};

	return {
		setContainer(nextContainer) {
			if (container === nextContainer) {
				return;
			}

			clearRangeInteraction();
			resizeObserver?.disconnect();
			resizeObserver = null;

			if (chart) {
				chart.dispose();
				chart = null;
			}

			container = nextContainer;
			if (!container) {
				return;
			}

			ensureObservers();
			bindRangeInteraction();
			renderLatest();
		},

		render(payload) {
			latestPayload = payload;
			renderLatest();
		},

		resize() {
			chart?.resize();
		},

		dispose() {
			clearRangeInteraction();
			resizeObserver?.disconnect();
			resizeObserver = null;
			themeObserver?.disconnect();
			themeObserver = null;
			if (chart) {
				chart.dispose();
				chart = null;
			}
			container = null;
			latestPayload = null;
		},

		getChart() {
			return chart;
		},
	};
}
