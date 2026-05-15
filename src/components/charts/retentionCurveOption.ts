import type { EChartsOption } from "../../utils/echarts-loader";
import {
	applyRetentionChartLayout,
	type RetentionChartThemeColors,
} from "./retentionChartStyle";

export interface RetentionCurveThemeColors extends RetentionChartThemeColors {
	bgColor?: string;
	borderColor?: string;
	tooltipBg?: string;
	tooltipBorder?: string;
	axisLabelColor?: string;
}

interface RetentionCurveOptionConfig {
	colors: RetentionCurveThemeColors;
	isMobile: boolean;
	xAxisData: Array<string | number>;
	axisXName: string;
	axisYName: string;
	series: NonNullable<EChartsOption["series"]>;
	tooltipFormatter: (params: any) => string;
	tooltipPosition?: any;
}

export function buildRetentionCurveOption({
	colors,
	isMobile,
	xAxisData,
	axisXName,
	axisYName,
	series,
	tooltipFormatter,
	tooltipPosition,
}: RetentionCurveOptionConfig): EChartsOption {
	const option: EChartsOption = {
		tooltip: {
			trigger: "axis",
			backgroundColor: colors.tooltipBg ?? colors.bgColor ?? "#ffffff",
			borderColor: colors.tooltipBorder ?? colors.borderColor ?? "#dddddd",
			borderWidth: 1,
			textStyle: {
				color: colors.textColor,
				fontSize: 14,
			},
			shadowBlur: 10,
			shadowColor: "rgba(0, 0, 0, 0.2)",
			extraCssText: "border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);",
			confine: true,
			position: tooltipPosition,
			formatter: tooltipFormatter,
		},
		xAxis: {
			type: "category",
			data: xAxisData,
			name: axisXName,
			nameLocation: "middle",
			nameGap: 30,
			axisLine: {
				show: true,
				symbol: ["none", "arrow"],
				symbolSize: [8, 10],
				lineStyle: { color: colors.axisLineColor },
			},
			axisLabel: {
				color: colors.axisLabelColor ?? colors.textColor,
				fontSize: 12,
			},
			nameTextStyle: {
				color: colors.textColor,
				fontSize: 13,
			},
		},
		yAxis: {
			type: "value",
			name: axisYName,
			min: 0,
			max: 100,
			axisLine: {
				show: true,
				symbol: ["none", "arrow"],
				symbolSize: [8, 10],
				lineStyle: { color: colors.axisLineColor },
			},
			axisLabel: {
				color: colors.axisLabelColor ?? colors.textColor,
				formatter: "{value}%",
				fontSize: 12,
			},
			nameTextStyle: {
				color: colors.textColor,
				fontSize: 13,
			},
			splitLine: {
				lineStyle: {
					color: colors.splitLineColor,
					type: "dashed",
				},
			},
		},
		series,
	};

	applyRetentionChartLayout(option as any, colors, isMobile);
	return option;
}
