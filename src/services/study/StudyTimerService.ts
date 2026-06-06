export interface StudyTimerServiceOptions {
	autoPauseSeconds?: number;
	onAutoPaused?: () => void;
}

/**
 * 单卡学习计时器：统一 UI 展示与评分 responseTime 的数据源。
 * 超时自动暂停会真实冻结耗时，而不只是停止 UI 刷新。
 */
export class StudyTimerService {
	private startTime = Date.now();
	private frozenElapsedMs: number | null = null;
	private autoPauseMs = 60_000;
	private autoPauseNotified = false;
	private onAutoPaused?: () => void;

	constructor(options?: StudyTimerServiceOptions) {
		this.setAutoPauseSeconds(options?.autoPauseSeconds ?? 60);
		this.onAutoPaused = options?.onAutoPaused;
	}

	setAutoPauseSeconds(seconds: number): void {
		const normalizedSeconds = Math.max(0, Math.floor(seconds));
		this.autoPauseMs = normalizedSeconds * 1000;

		if (this.frozenElapsedMs !== null && this.autoPauseMs > 0) {
			this.frozenElapsedMs = Math.min(this.frozenElapsedMs, this.autoPauseMs);
		}
	}

	setOnAutoPaused(callback?: () => void): void {
		this.onAutoPaused = callback;
	}

	reset(now = Date.now()): void {
		this.startTime = now;
		this.frozenElapsedMs = null;
		this.autoPauseNotified = false;
	}

	setStartTime(time: number): void {
		this.startTime = time;
		this.frozenElapsedMs = null;
		this.autoPauseNotified = false;
	}

	getStartTime(): number {
		return this.startTime;
	}

	isPaused(): boolean {
		if (this.frozenElapsedMs !== null) {
			return true;
		}

		const cap = this.getAutoPauseCapMs();
		return cap !== null && this.getRawElapsedMs() >= cap;
	}

	setPaused(paused: boolean, now = Date.now()): void {
		if (paused) {
			if (this.frozenElapsedMs === null) {
				this.frozenElapsedMs = Math.min(this.getRawElapsedMs(now), this.getAutoPauseCapMs() ?? Number.POSITIVE_INFINITY);
			}
			return;
		}

		if (this.frozenElapsedMs !== null) {
			this.startTime = now - this.frozenElapsedMs;
			this.frozenElapsedMs = null;
			this.autoPauseNotified = false;
		}
	}

	getElapsedMs(now = Date.now()): number {
		if (this.frozenElapsedMs !== null) {
			return this.frozenElapsedMs;
		}

		const elapsed = this.getRawElapsedMs(now);
		const cap = this.getAutoPauseCapMs();
		if (cap !== null && elapsed >= cap) {
			this.frozenElapsedMs = cap;
			this.notifyAutoPaused();
			return cap;
		}

		return elapsed;
	}

	getResponseTimeMs(now = Date.now()): number {
		return this.getElapsedMs(now);
	}

	private getRawElapsedMs(now = Date.now()): number {
		return Math.max(0, now - this.startTime);
	}

	private getAutoPauseCapMs(): number | null {
		if (this.autoPauseMs <= 0) {
			return null;
		}

		return this.autoPauseMs;
	}

	private notifyAutoPaused(): void {
		if (this.autoPauseNotified) {
			return;
		}

		this.autoPauseNotified = true;
		this.onAutoPaused?.();
	}
}
