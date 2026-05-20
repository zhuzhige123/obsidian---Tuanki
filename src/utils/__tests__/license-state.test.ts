import type { LicenseInfo } from "../../types/license";
import {
  LICENSED_PRODUCTS,
  cloneLicenseAsInherited,
  licenseAppliesToProduct,
  mapProductIdToEntitlements,
  resolveEffectiveLicenseState,
} from "../license-state";

function createLicense(overrides: Partial<LicenseInfo> = {}): LicenseInfo {
  return {
    activationCode: overrides.activationCode ?? "test-code",
    isActivated: overrides.isActivated ?? true,
    activatedAt: overrides.activatedAt ?? "2026-05-01T00:00:00.000Z",
    deviceFingerprint: overrides.deviceFingerprint ?? "device-fingerprint",
    expiresAt: overrides.expiresAt ?? "2099-05-01T00:00:00.000Z",
    productVersion: overrides.productVersion ?? "0.7.25",
    licenseType: overrides.licenseType ?? "lifetime",
    entitlements: overrides.entitlements ?? [],
    issuedProductId: overrides.issuedProductId,
    source: overrides.source ?? "local",
    sourcePluginId: overrides.sourcePluginId,
    boundEmail: overrides.boundEmail,
    cloudSync: overrides.cloudSync,
    fingerprintVersion: overrides.fingerprintVersion,
    userId: overrides.userId,
    maxDevices: overrides.maxDevices,
    features: overrides.features,
    metadata: overrides.metadata,
  };
}

describe("license-state dual product rules", () => {
  it("maps Weave product ids to Weave, EPUB, and IR entitlements", () => {
    expect(mapProductIdToEntitlements("weave")).toEqual([
      "weave-premium",
      "epub-premium",
      "ir-premium",
    ]);
    expect(mapProductIdToEntitlements("weave-obsidian-plugin")).toEqual([
      "weave-premium",
      "epub-premium",
      "ir-premium",
    ]);
  });

  it("maps standalone EPUB product id to EPUB entitlement only", () => {
    expect(mapProductIdToEntitlements("weave-epub-reader")).toEqual(["epub-premium"]);
  });

  it("allows Weave license to apply to EPUB but not vice versa", () => {
    const weaveLicense = createLicense({
      activationCode: "weave-license",
      entitlements: ["weave-premium", "epub-premium"],
      issuedProductId: "weave",
    });
    const epubLicense = createLicense({
      activationCode: "epub-license",
      entitlements: ["epub-premium"],
      issuedProductId: "weave-epub-reader",
    });

    expect(licenseAppliesToProduct(weaveLicense, LICENSED_PRODUCTS.WEAVE)).toBe(true);
    expect(licenseAppliesToProduct(weaveLicense, LICENSED_PRODUCTS.EPUB)).toBe(true);
    expect(licenseAppliesToProduct(epubLicense, LICENSED_PRODUCTS.EPUB)).toBe(true);
    expect(licenseAppliesToProduct(epubLicense, LICENSED_PRODUCTS.WEAVE)).toBe(false);
  });

  it("includes inherited Weave license when resolving EPUB effective state", () => {
    const weaveLicense = createLicense({
      activationCode: "weave-license",
      entitlements: ["weave-premium", "epub-premium"],
      issuedProductId: "weave",
    });

    const effectiveState = resolveEffectiveLicenseState({
      product: LICENSED_PRODUCTS.EPUB,
      inheritedLicenses: [cloneLicenseAsInherited(weaveLicense, LICENSED_PRODUCTS.WEAVE)],
    });

    expect(effectiveState.isPremiumActive).toBe(true);
    expect(effectiveState.primaryLicense?.source).toBe("inherited");
    expect(effectiveState.primaryLicense?.sourcePluginId).toBe(LICENSED_PRODUCTS.WEAVE);
    expect(effectiveState.entitlements).toContain("epub-premium");
  });

  it("prefers local EPUB license while keeping inherited Weave license available", () => {
    const localEpubLicense = createLicense({
      activationCode: "epub-local",
      entitlements: ["epub-premium"],
      issuedProductId: "weave-epub-reader",
    });
    const inheritedWeaveLicense = cloneLicenseAsInherited(
      createLicense({
        activationCode: "weave-parent",
        entitlements: ["weave-premium", "epub-premium"],
        issuedProductId: "weave",
      }),
      LICENSED_PRODUCTS.WEAVE
    );

    const effectiveState = resolveEffectiveLicenseState({
      product: LICENSED_PRODUCTS.EPUB,
      localLicenses: [localEpubLicense],
      inheritedLicenses: [inheritedWeaveLicense],
    });

    expect(effectiveState.isPremiumActive).toBe(true);
    expect(effectiveState.localLicenses).toHaveLength(1);
    expect(effectiveState.inheritedLicenses).toHaveLength(1);
    expect(effectiveState.activeLicenses).toHaveLength(2);
    expect(effectiveState.primaryLicense?.activationCode).toBe("epub-local");
  });

  it("does not activate Weave product from EPUB-only local license", () => {
    const epubLicense = createLicense({
      activationCode: "epub-only",
      entitlements: ["epub-premium"],
      issuedProductId: "weave-epub-reader",
    });

    const effectiveState = resolveEffectiveLicenseState({
      product: LICENSED_PRODUCTS.WEAVE,
      localLicenses: [epubLicense],
    });

    expect(effectiveState.isPremiumActive).toBe(false);
    expect(effectiveState.primaryLicense).toBeNull();
    expect(effectiveState.activeLicenses).toHaveLength(0);
  });
});
