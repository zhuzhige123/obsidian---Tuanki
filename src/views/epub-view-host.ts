import type { App } from "obsidian";
import type { AISelectedTextPanelHost } from "../services/ai/ai-host";
import type {
	EpubHostCardCapabilities,
	EpubHostIRCapabilities,
	EpubHostReaderCapabilities,
} from "../services/epub";

export type EpubViewHost = {
	app: App;
} & EpubHostReaderCapabilities &
	EpubHostIRCapabilities &
	EpubHostCardCapabilities &
	Partial<AISelectedTextPanelHost>;

export function isAISelectedTextPanelHost(host: EpubViewHost): host is EpubViewHost & AISelectedTextPanelHost {
	return Boolean(host?.app && (host as Partial<AISelectedTextPanelHost>).dataStorage && (host as Partial<AISelectedTextPanelHost>).settings);
}
