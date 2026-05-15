export interface IRCalendarActiveReadingTimerState {
	blockId: string;
	deckId: string;
	title: string;
	startedAtMs: number;
	baseSeconds: number;
}

interface IRCalendarTimerRuntimeState {
	activeReadingTimer: IRCalendarActiveReadingTimerState | null;
}

let runtimeState: IRCalendarTimerRuntimeState = {
	activeReadingTimer: null,
};

export function getIRCalendarTimerRuntimeState(): Readonly<IRCalendarTimerRuntimeState> {
	return runtimeState;
}

export function setIRCalendarTimerRuntimeState(patch: Partial<IRCalendarTimerRuntimeState>): void {
	runtimeState = {
		...runtimeState,
		...patch,
	};
}
