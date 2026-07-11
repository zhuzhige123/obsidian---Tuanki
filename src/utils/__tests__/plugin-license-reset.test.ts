import { PremiumFeatureGuard } from "../../services/premium/PremiumFeatureGuard";
import type { LicenseInfo, LicenseStore } from "../../types/license";
import {
  getPluginEffectiveLicenseState,
  getPluginLocalLicenses,
  type LicenseCapablePluginLike,
  resetPluginLicenseActivation,
} from "../plugin-license";

describe("plugin license helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty local licenses when plugin settings are not initialized yet", () => {
    const plugin: LicenseCapablePluginLike = {
      manifest: { id: "weave" },
      getLocalLicenses() {
        return (this as LicenseCapablePluginLike).settings?.licenseState?.localLicenses ?? [];
      },
    };

    expect(getPluginLocalLicenses(plugin)).toEqual([]);
    expect(getPluginEffectiveLicenseState(plugin).isPremiumActive).toBe(false);
  });
});

describe("resetPluginLicenseActivation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears local licenses, updates premium guard, and persists settings immediately", async () => {
    const saveSettings = vi.fn(async () => undefined);
    const localLicense: LicenseInfo = {
      activationCode: "test-code",
      isActivated: true,
      activatedAt: "2026-05-01T00:00:00.000Z",
      deviceFingerprint: "device",
      expiresAt: "2099-05-01T00:00:00.000Z",
      productVersion: "1.0.0",
      licenseType: "lifetime",
      entitlements: ["weave-premium"],
    };
    const licenseState: LicenseStore = {
      localLicenses: [localLicense],
    };
    const plugin: LicenseCapablePluginLike = {
      manifest: { id: "weave" },
      settings: {
        license: localLicense,
        licenseState,
      },
      saveSettings,
    };

    const updateLicenseState = vi
      .spyOn(PremiumFeatureGuard.getInstance(), "updateLicenseState")
      .mockResolvedValue(undefined);

    expect(getPluginEffectiveLicenseState(plugin).isPremiumActive).toBe(true);

    await resetPluginLicenseActivation(plugin);

    expect(getPluginEffectiveLicenseState(plugin).isPremiumActive).toBe(false);
    expect(plugin.settings?.licenseState?.localLicenses).toEqual([]);
    expect(plugin.settings?.license?.activationCode).toBe("");
    expect(plugin.settings?.license?.isActivated).toBe(false);
    expect(updateLicenseState).toHaveBeenCalledWith({
      product: "weave",
      localLicenses: [],
    });
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});
