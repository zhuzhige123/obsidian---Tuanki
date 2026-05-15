export interface IRRuntimeConfig {
	pluginId: string;
	pluginDirName: string;
	viewTypes: {
		calendar: string;
		deck: string;
		focus: string;
	};
	collaboratorHostPluginIds: string[];
}

declare const __WEAVE_IR_STANDALONE__: boolean;

const isStandalone = typeof __WEAVE_IR_STANDALONE__ !== "undefined" && __WEAVE_IR_STANDALONE__;

export const IR_RUNTIME: IRRuntimeConfig = {
	pluginId: isStandalone ? "weave-incremental-reading" : "weave",
	pluginDirName: isStandalone ? "weave-incremental-reading" : "weave",
	viewTypes: {
		calendar: isStandalone ? "weave-ir-calendar-view-standalone" : "weave-ir-calendar-view",
		deck: isStandalone ? "weave-irdeck-file-standalone" : "weave-irdeck-file",
		focus: isStandalone ? "weave-ir-focus-view-standalone" : "weave-ir-focus-view",
	},
	collaboratorHostPluginIds: isStandalone ? ["weave", "weave-epub-reader"] : [],
};

export function getIRRuntime(): IRRuntimeConfig {
	return IR_RUNTIME;
}
