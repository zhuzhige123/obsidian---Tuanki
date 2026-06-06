import type { Vault } from "obsidian";
import { shouldHideDocumentPropertiesForVault } from "../document-properties-visibility";

function vaultWithPropertiesInDocument(mode: unknown): Vault {
	return {
		getConfig: (key: string) => (key === "propertiesInDocument" ? mode : undefined),
	} as unknown as Vault;
}

describe("shouldHideDocumentPropertiesForVault", () => {
	it("shows properties when config is missing (Obsidian default visible)", () => {
		expect(shouldHideDocumentPropertiesForVault({} as Vault)).toBe(false);
	});

	it("hides only when mode is hidden", () => {
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument("hidden"))).toBe(
			true
		);
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument("Hidden"))).toBe(
			true
		);
	});

	it("does not hide for visible or source modes", () => {
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument("visible"))).toBe(
			false
		);
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument("source"))).toBe(
			false
		);
	});

	it("supports legacy boolean false as hidden", () => {
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument(false))).toBe(true);
		expect(shouldHideDocumentPropertiesForVault(vaultWithPropertiesInDocument(true))).toBe(false);
	});
});
