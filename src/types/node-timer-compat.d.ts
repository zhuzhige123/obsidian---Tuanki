/**
 * Obsidian/Electron renderer: DOM numeric timer IDs (not NodeJS.Timeout objects).
 */
export {};

declare global {
	function setTimeout(
		handler: TimerHandler,
		timeout?: number,
		...arguments: unknown[]
	): number;
	function setInterval(
		handler: TimerHandler,
		timeout?: number,
		...arguments: unknown[]
	): number;
	function clearTimeout(handle?: number): void;
	function clearInterval(handle?: number): void;
}

declare namespace NodeJS {
	type Timeout = number;
	type Immediate = number;
	type Timer = number;
}
