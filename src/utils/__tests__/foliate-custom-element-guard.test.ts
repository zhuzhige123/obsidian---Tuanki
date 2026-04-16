import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFoliateCustomElementGuard } from "../foliate-custom-element-guard";

const PATCH_FLAG = "__weaveFoliateCustomElementGuardInstalled__";
const ORIGINAL_DEFINE_KEY = "__weaveFoliateOriginalCustomElementDefine__";

describe("installFoliateCustomElementGuard", () => {
	beforeEach(() => {
		delete (globalThis as Record<string, unknown>)[PATCH_FLAG];
		delete (globalThis as Record<string, unknown>)[ORIGINAL_DEFINE_KEY];
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>)[PATCH_FLAG];
		delete (globalThis as Record<string, unknown>)[ORIGINAL_DEFINE_KEY];
	});

	it("skips duplicate foliate element definitions", () => {
		const existingCtor = class ExistingFoliateView extends HTMLElement {};
		const get = vi.fn((name: string) =>
			name === "foliate-view" ? existingCtor : undefined
		);
		const originalDefine = vi.fn();
		const registry = {
			define: originalDefine,
			get,
		} as unknown as CustomElementRegistry;

		installFoliateCustomElementGuard(registry);

		registry.define("foliate-view", class NewFoliateView extends HTMLElement {});

		expect(get).toHaveBeenCalledWith("foliate-view");
		expect(originalDefine).not.toHaveBeenCalled();
	});

	it("still forwards non-foliate definitions", () => {
		const originalDefine = vi.fn();
		const registry = {
			define: originalDefine,
			get: vi.fn(() => undefined),
		} as unknown as CustomElementRegistry;

		installFoliateCustomElementGuard(registry);

		const ctor = class DemoElement extends HTMLElement {};
		registry.define("demo-element", ctor);

		expect(originalDefine).toHaveBeenCalledWith("demo-element", ctor, undefined);
	});
});
