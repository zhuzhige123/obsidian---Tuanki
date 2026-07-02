export interface RetentionChartThemeColors {
	textColor: string;
	axisLineColor: string;
	splitLineColor: string;
	accentColor: string;
}

interface RetentionChartSeriesLike {
	name?: string | null;
}

interface RetentionChartAxisLike {
	nameGap?: number;
	nameTextStyle?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface RetentionChartOptionLike {
	series?: RetentionChartSeriesLike[];
	legend?: unknown;
	grid?: unknown;
	xAxis?: RetentionChartAxisLike | RetentionChartAxisLike[];
	yAxis?: RetentionChartAxisLike | RetentionChartAxisLike[];
	[key: string]: unknown;
}

export function createRetentionScrollableLegend(
	data: string[],
	colors: RetentionChartThemeColors,
	isMobile: boolean
) {
	return {
		type: "scroll",
		data,
		left: isMobile ? 6 : 10,
		right: isMobile ? 6 : 10,
		bottom: isMobile ? 4 : 8,
		pageIconColor: colors.accentColor,
		pageIconInactiveColor: colors.axisLineColor,
		pageTextStyle: {
			color: colors.textColor,
			fontSize: isMobile ? 11 : 12,
		},
		textStyle: {
			color: colors.textColor,
			fontSize: isMobile ? 11 : 12,
		},
		itemGap: isMobile ? 10 : 14,
		icon: "roundRect",
		itemWidth: isMobile ? 10 : 12,
		itemHeight: isMobile ? 10 : 12,
		tooltip: {
			show: true,
		},
	};
}

export function createRetentionChartGrid(isMobile: boolean, withLegend = true) {
	return {
		left: isMobile ? 18 : 30,
		right: isMobile ? 10 : 28,
		top: withLegend ? (isMobile ? 26 : 34) : isMobile ? 24 : 32,
		bottom: withLegend ? (isMobile ? 70 : 76) : isMobile ? 46 : 54,
		containLabel: true,
	};
}

export function applyRetentionChartLayout(
	option: RetentionChartOptionLike,
	colors: RetentionChartThemeColors,
	isMobile: boolean
) {
	const seriesNames = Array.isArray(option?.series)
		? option.series
				.map((item: RetentionChartSeriesLike) => item?.name)
				.filter(
					(name: unknown): name is string => typeof name === "string" && name.trim().length > 0
				)
		: [];

	const hasLegend = seriesNames.length > 1;
	if (hasLegend) {
		option.legend = createRetentionScrollableLegend(seriesNames, colors, isMobile);
	}
	option.grid = createRetentionChartGrid(isMobile, hasLegend);

	if (option?.xAxis && !Array.isArray(option.xAxis)) {
		option.xAxis.nameGap = 24;
		if (option.xAxis.nameTextStyle) {
			option.xAxis.nameTextStyle = {
				...option.xAxis.nameTextStyle,
				fontSize: 12,
			};
		}
	}

	if (Array.isArray(option?.yAxis)) {
		option.yAxis = option.yAxis.map((axis: RetentionChartAxisLike) => {
			if (!axis?.nameTextStyle) return axis;
			return {
				...axis,
				nameTextStyle: {
					...axis.nameTextStyle,
					fontSize: 12,
				},
			};
		});
		return;
	}

	if (option?.yAxis?.nameTextStyle) {
		option.yAxis.nameTextStyle = {
			...option.yAxis.nameTextStyle,
			fontSize: 12,
		};
	}
}
