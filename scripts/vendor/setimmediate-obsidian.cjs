/**
 * Obsidian-safe setImmediate shim for jszip/setimmediate consumers.
 * Avoids the legacy DOM <script> injection path flagged by community review static analysis.
 */
"use strict";

const globalObject =
	typeof globalThis !== "undefined"
		? globalThis
		: typeof self !== "undefined"
			? self
			: typeof global !== "undefined"
				? global
				: this;

function setImmediatePolyfill(callback, ...args) {
	if (typeof callback !== "function") {
		throw new TypeError("Callback must be a function");
	}
	return setTimeout(() => {
		callback(...args);
	}, 0);
}

function clearImmediatePolyfill(handle) {
	clearTimeout(handle);
}

const setImmediateFn =
	typeof globalObject.setImmediate === "function"
		? globalObject.setImmediate.bind(globalObject)
		: setImmediatePolyfill;

const clearImmediateFn =
	typeof globalObject.clearImmediate === "function"
		? globalObject.clearImmediate.bind(globalObject)
		: clearImmediatePolyfill;

module.exports = setImmediateFn;
module.exports.setImmediate = setImmediateFn;
module.exports.clearImmediate = clearImmediateFn;
