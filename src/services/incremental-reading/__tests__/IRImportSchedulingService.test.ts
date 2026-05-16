import { IRImportSchedulingService } from "../IRImportSchedulingService";
import type { SchedulingConfig } from "../../../types/ir-import-scheduling";

describe("IRImportSchedulingService", () => {
	const createService = (dailyBudgetMinutes: number) =>
		new IRImportSchedulingService({
			dailyBudgetMinutes,
			getBlocksForDate: async () => [],
			estimateBlockMinutes: () => 10,
		});

	it("distributionDays 为 0 时仍会生成至少一天的计划", async () => {
		const service = createService(60);
		const config: SchedulingConfig = {
			distributionDays: 0,
			strategy: "balanced",
			dailyMinimum: false,
			targetLoadRate: 0.8,
		};

		const impact = await service.calculateScheduling([{ id: "b1" } as any], config, new Date("2026-04-09"));

		expect(impact.dailyLoads).toHaveLength(1);
		expect(impact.dailyLoads[0].newCount).toBe(1);
		expect(Number.isFinite(impact.peakLoadRate)).toBe(true);
		expect(Number.isFinite(impact.averageLoadRate)).toBe(true);
	});

	it("dailyBudgetMinutes 为 0 时不会产生 Infinity 或 NaN 负载率", async () => {
		const service = createService(0);
		const config: SchedulingConfig = {
			distributionDays: 2,
			strategy: "even",
			dailyMinimum: false,
			targetLoadRate: 0.8,
		};

		const impact = await service.calculateScheduling(
			[{ id: "b1" } as any, { id: "b2" } as any],
			config,
			new Date("2026-04-09")
		);

		expect(impact.dailyLoads).toHaveLength(2);
		expect(impact.dailyLoads.every((load) => Number.isFinite(load.loadRate))).toBe(true);
		expect(Number.isFinite(impact.peakLoadRate)).toBe(true);
		expect(Number.isFinite(impact.averageLoadRate)).toBe(true);
	});
});
