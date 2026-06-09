/**
 * Obsidian-safe immediate shim for jszip/lie scheduling.
 * Avoids legacy DOM <script> injection used by the immediate package fallback.
 */
"use strict";

let draining = false;
const queue = [];

function drainQueue() {
	draining = true;
	const batch = queue.splice(0, queue.length);
	for (const task of batch) {
		task();
	}
	draining = false;
	if (queue.length > 0) {
		setTimeout(drainQueue, 0);
	}
}

module.exports = function immediate(task) {
	if (typeof task !== "function") {
		throw new TypeError("Task must be a function");
	}
	queue.push(task);
	if (queue.length === 1 && !draining) {
		setTimeout(drainQueue, 0);
	}
};
