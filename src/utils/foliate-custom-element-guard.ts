const FOLIATE_CUSTOM_ELEMENT_NAMES = new Set([
	"foliate-view",
	"foliate-fxl",
	"foliate-paginator",
]);

const PATCH_FLAG = "__weaveFoliateCustomElementGuardInstalled__";
const ORIGINAL_DEFINE_KEY = "__weaveFoliateOriginalCustomElementDefine__";

type GuardedGlobal = typeof window & {
	[PATCH_FLAG]?: boolean;
	[ORIGINAL_DEFINE_KEY]?: CustomElementRegistry["define"];
};

export function installFoliateCustomElementGuard(
	registry: CustomElementRegistry = customElements
): void {
	const globalScope = window as GuardedGlobal;
	if (globalScope[PATCH_FLAG]) {
		return;
	}

	const originalDefine = globalScope[ORIGINAL_DEFINE_KEY] || registry.define.bind(registry);
	globalScope[ORIGINAL_DEFINE_KEY] = originalDefine;

	registry.define = function defineWithFoliateGuard(
		this: CustomElementRegistry,
		name: string,
		constructor: CustomElementConstructor,
		options?: ElementDefinitionOptions
	): void {
		if (FOLIATE_CUSTOM_ELEMENT_NAMES.has(name) && this.get(name)) {
			return;
		}

		return originalDefine.call(this, name, constructor, options);
	};

	globalScope[PATCH_FLAG] = true;
}

if (typeof customElements !== "undefined") {
	installFoliateCustomElementGuard();
}
