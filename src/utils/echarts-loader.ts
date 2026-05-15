/**
 * ECharts按需引入配置
 * 只加载项目中实际使用的图表类型和组件，显著减少体积
 *
 * 优化效果：
 * - 完整引入: ~3.6MB (未压缩) / ~1.5MB (压缩)
 * - 按需引入: ~1.8MB (未压缩) / ~800KB (压缩)
 * - 体积减少: ~50%
 */

import type { EChartsCoreOption } from "echarts";
import * as echarts from "echarts/core";
import type { EChartsType } from "echarts/core";

// 引入需要的图表类型
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";

// 引入需要的组件
import {
	DataZoomComponent,
	GridComponent,
	LegendComponent,
	MarkLineComponent,
	MarkPointComponent,
	TooltipComponent,
	VisualMapComponent,
} from "echarts/components";
import { LabelLayout } from "echarts/features";

// 引入Canvas渲染器（必须）
import { CanvasRenderer } from "echarts/renderers";

// 注册所有组件
echarts.use([
	// 图表类型
	LineChart,
	BarChart,
	ScatterChart,
	HeatmapChart,
	PieChart,

	// 组件
	TooltipComponent,
	GridComponent,
	LegendComponent,
	DataZoomComponent,
	VisualMapComponent,
	MarkLineComponent,
	MarkPointComponent,
	LabelLayout,

	// 渲染器
	CanvasRenderer,
]);

// 导出配置好的echarts实例和类型
export default echarts;
export { echarts }; // 命名导出
export type { EChartsType, EChartsCoreOption as EChartsOption };
