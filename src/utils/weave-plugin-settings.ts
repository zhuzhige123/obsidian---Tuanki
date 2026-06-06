import type { Plugin } from "obsidian";
import type WeavePlugin from "../main";
import { readUnknownBoolean, readUnknownString } from "./dynamic-access";

export function asWeavePlugin(plugin: Plugin): WeavePlugin {
	return plugin as WeavePlugin;
}

export function readWeaveParentFolder(plugin: Plugin): string | undefined {
	const settings = asWeavePlugin(plugin).settings;
	return readUnknownString(settings, "weaveParentFolder");
}

export function readWeaveDebugEnabled(plugin: Plugin): boolean {
	const settings = asWeavePlugin(plugin).settings;
	return readUnknownBoolean(settings, "enableDebugMode") ?? false;
}
