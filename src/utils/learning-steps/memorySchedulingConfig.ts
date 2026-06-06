export interface MemorySchedulingSettings {
	learningSteps: number[];
	relearningSteps: number[];
	graduatingInterval: number;
	easyInterval: number;
}

export type MemorySchedulingSettingsInput = Partial<MemorySchedulingSettings> | null | undefined;

export const DEFAULT_MEMORY_SCHEDULING_SETTINGS = {
	learningSteps: [1, 10],
	relearningSteps: [10],
	graduatingInterval: 1,
	easyInterval: 4,
} as const satisfies MemorySchedulingSettings;

export function createDefaultMemorySchedulingSettings(): MemorySchedulingSettings {
	return {
		learningSteps: [...DEFAULT_MEMORY_SCHEDULING_SETTINGS.learningSteps],
		relearningSteps: [...DEFAULT_MEMORY_SCHEDULING_SETTINGS.relearningSteps],
		graduatingInterval: DEFAULT_MEMORY_SCHEDULING_SETTINGS.graduatingInterval,
		easyInterval: DEFAULT_MEMORY_SCHEDULING_SETTINGS.easyInterval,
	};
}

function hasSameArrayValues(raw: unknown, normalized: number[]): boolean {
	if (!Array.isArray(raw) || raw.length !== normalized.length) {
		return false;
	}

	return raw.every((value, index) => value === normalized[index]);
}

function normalizeStepSequence(
	raw: unknown,
	fallback: readonly number[]
): { value: number[]; changed: boolean } {
	if (raw === undefined || raw === null) {
		return { value: [...fallback], changed: true };
	}

	if (!Array.isArray(raw)) {
		return { value: [...fallback], changed: true };
	}

	if (raw.length === 0) {
		return { value: [], changed: false };
	}

	const normalized = raw
		.map((item) => Number(item))
		.filter((item) => Number.isFinite(item) && item > 0)
		.map((item) => Math.max(1, Math.round(item)));

	if (normalized.length === 0) {
		return { value: [...fallback], changed: true };
	}

	return {
		value: normalized,
		changed: !hasSameArrayValues(raw, normalized),
	};
}

function normalizePositiveInteger(
	raw: unknown,
	fallback: number
): { value: number; changed: boolean } {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric) || numeric < 1) {
		return { value: fallback, changed: true };
	}

	const normalized = Math.max(1, Math.round(numeric));
	return { value: normalized, changed: raw !== normalized };
}

function normalizeAgainstFallback(
	input: MemorySchedulingSettingsInput,
	fallback: MemorySchedulingSettings
): { settings: MemorySchedulingSettings; changed: boolean } {
	const learningSteps = normalizeStepSequence(input?.learningSteps, fallback.learningSteps);
	const relearningSteps = normalizeStepSequence(input?.relearningSteps, fallback.relearningSteps);
	const graduatingInterval = normalizePositiveInteger(
		input?.graduatingInterval,
		fallback.graduatingInterval
	);
	const easyInterval = normalizePositiveInteger(input?.easyInterval, fallback.easyInterval);

	return {
		settings: {
			learningSteps: learningSteps.value,
			relearningSteps: relearningSteps.value,
			graduatingInterval: graduatingInterval.value,
			easyInterval: easyInterval.value,
		},
		changed:
			learningSteps.changed ||
			relearningSteps.changed ||
			graduatingInterval.changed ||
			easyInterval.changed,
	};
}

export function normalizeMemorySchedulingSettings(
	input: MemorySchedulingSettingsInput,
	fallbackInput?: MemorySchedulingSettingsInput
): { settings: MemorySchedulingSettings; changed: boolean } {
	const fallback = fallbackInput
		? normalizeAgainstFallback(fallbackInput, createDefaultMemorySchedulingSettings()).settings
		: createDefaultMemorySchedulingSettings();

	return normalizeAgainstFallback(input, fallback);
}

export function mergeNormalizedMemorySchedulingSettings<T extends Record<string, unknown>>(
	input: T | null | undefined,
	fallbackInput?: MemorySchedulingSettingsInput
): { value: T & MemorySchedulingSettings; changed: boolean } {
	const source = (input ?? {}) as T;
	const { settings, changed } = normalizeMemorySchedulingSettings(source, fallbackInput);

	return {
		value: {
			...source,
			...settings,
		},
		changed,
	};
}
