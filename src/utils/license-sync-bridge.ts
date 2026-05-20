export const WEAVE_LICENSE_CHANGED_WORKSPACE_EVENT = "Weave:license-changed";

export const WEAVE_LICENSE_CHANGED_WINDOW_EVENT = WEAVE_LICENSE_CHANGED_WORKSPACE_EVENT;

type LicenseChangeEmitterApp = {
	workspace?: {
		trigger?: (name: string, ...args: unknown[]) => void;
	};
};

/** Notify dependent plugins (for example weave-epub-reader) that license state changed. */
export function emitWeaveLicenseChanged(app: LicenseChangeEmitterApp): void {
	app.workspace?.trigger?.(WEAVE_LICENSE_CHANGED_WORKSPACE_EVENT);
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(WEAVE_LICENSE_CHANGED_WINDOW_EVENT));
	}
}
