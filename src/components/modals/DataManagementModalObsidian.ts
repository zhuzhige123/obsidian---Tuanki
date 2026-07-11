import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { Card } from "../../data/types";
import type WeavePlugin from "../../main";
import type { DataCheckResult } from "../../services/data-management/DataManagementService";
import { t } from "../../utils/i18n";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import DataManagementModal from "./DataManagementModal.svelte";

export interface StartupGateDismissPayload {
	disableFutureAutoPopup?: boolean;
}

export interface DataManagementModalObsidianOptions {
	plugin: WeavePlugin;
	cards?: Card[];
	allCards?: Card[];
	initialTab?: "data";
	startupGate?: boolean;
	onStartupGateAcknowledge?: (payload: {
		checkResults: DataCheckResult[];
		migrationResults: DataCheckResult[];
	}) => void;
	onStartupGateDismiss?: (payload?: StartupGateDismissPayload) => void;
	onClose?: () => void;
}

export class DataManagementModalObsidian extends Modal {
	private component: unknown = null;
	private readonly options: DataManagementModalObsidianOptions;
	private startupGateResolved = false;
	private readDisableFutureAutoPopup: () => boolean = () => false;

	constructor(app: App, options: DataManagementModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle(
			this.options.startupGate
				? t("management.dataManagementModal.startupGate.title")
				: t("dataManagement.title")
		);
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-data-management-modal",
			contentClass: "weave-data-management-modal-content",
		});

		if (this.options.startupGate) {
			this.modalEl.addClass("weave-startup-data-gate-modal");
		}

		this.component = mount(DataManagementModal, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				cards: this.options.cards ?? [],
				allCards: this.options.allCards ?? [],
				initialTab: "data",
				startupGate: this.options.startupGate === true,
				registerStartupGateDismissState: (getter: () => boolean) => {
					this.readDisableFutureAutoPopup = getter;
				},
				onStartupGateAcknowledge: (payload: {
					checkResults: DataCheckResult[];
					migrationResults: DataCheckResult[];
				}) => {
					this.startupGateResolved = true;
					this.options.onStartupGateAcknowledge?.(payload);
					this.close();
				},
				onStartupGateDismiss: (payload?: StartupGateDismissPayload) => {
					this.startupGateResolved = true;
					this.options.onStartupGateDismiss?.(payload);
					this.close();
				},
			},
		});
	}

	onClose() {
		if (this.options.startupGate && !this.startupGateResolved) {
			this.options.onStartupGateDismiss?.({
				disableFutureAutoPopup: this.readDisableFutureAutoPopup(),
			});
		}

		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}

		this.contentEl.empty();
		this.options.onClose?.();
	}
}
