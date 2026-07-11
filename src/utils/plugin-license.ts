import type { EffectiveLicenseState, LicenseInfo, LicenseStore, LicensedProduct } from "../types/license";
import { PremiumFeatureGuard } from "../services/premium/PremiumFeatureGuard";
import {
  getLegacyPrimaryLicense,
  getProductFromPluginId,
  normalizeLicenseStore,
  resolveEffectiveLicenseState,
} from "./license-state";
import { emitWeaveLicenseChanged } from "./license-sync-bridge";

export interface LicenseCapablePluginLike {
  manifest?: {
    id?: string;
  };
  settings?: {
    license?: LicenseInfo;
    licenseState?: LicenseStore;
  };
  getLicensedProductId?: () => LicensedProduct;
  getLocalLicenses?: () => LicenseInfo[];
  getEffectiveLicenseState?: () => EffectiveLicenseState;
  saveSettings?: () => Promise<void>;
}

export function getPluginLicensedProduct(plugin: LicenseCapablePluginLike | null | undefined): LicensedProduct {
  return plugin?.getLicensedProductId?.() ?? getProductFromPluginId(plugin?.manifest?.id);
}

export function getPluginLocalLicenses(plugin: LicenseCapablePluginLike | null | undefined): LicenseInfo[] {
  if (!plugin) {
    return [];
  }

  if (typeof plugin.getLocalLicenses === "function") {
    try {
      return plugin.getLocalLicenses();
    } catch {
      return [];
    }
  }

  return normalizeLicenseStore(plugin.settings?.license, plugin.settings?.licenseState).localLicenses;
}

export function getPluginEffectiveLicenseState(
  plugin: LicenseCapablePluginLike | null | undefined
): EffectiveLicenseState {
  if (plugin?.getEffectiveLicenseState) {
    try {
      return plugin.getEffectiveLicenseState();
    } catch {
      return resolveEffectiveLicenseState({
        product: getPluginLicensedProduct(plugin),
        localLicenses: [],
      });
    }
  }

  return resolveEffectiveLicenseState({
    product: getPluginLicensedProduct(plugin),
    localLicenses: getPluginLocalLicenses(plugin),
  });
}

export function syncPluginLicenseSettings(plugin: LicenseCapablePluginLike | null | undefined): void {
  if (!plugin?.settings) {
    return;
  }

  const normalizedStore = normalizeLicenseStore(plugin.settings.license, plugin.settings.licenseState);
  plugin.settings.licenseState = normalizedStore;
  plugin.settings.license = getLegacyPrimaryLicense(normalizedStore.localLicenses);
}

export function upsertPluginLocalLicense(
  plugin: LicenseCapablePluginLike | null | undefined,
  license: LicenseInfo
): void {
  if (!plugin?.settings) {
    return;
  }

  const existingLicenses = getPluginLocalLicenses(plugin);
  const nextLicenses = existingLicenses.filter(
    (existingLicense) => existingLicense.activationCode !== license.activationCode
  );
  nextLicenses.unshift(license);

  plugin.settings.licenseState = {
    localLicenses: nextLicenses,
    updatedAt: new Date().toISOString(),
  };
  syncPluginLicenseSettings(plugin);
}

export function clearPluginLocalLicenses(plugin: LicenseCapablePluginLike | null | undefined): void {
  if (!plugin?.settings) {
    return;
  }

  plugin.settings.licenseState = {
    localLicenses: [],
    updatedAt: new Date().toISOString(),
  };
  plugin.settings.license = getLegacyPrimaryLicense([]);
  syncPluginLicenseSettings(plugin);
}

/**
 * 立即移除本插件本地激活状态，并同步高级功能守卫与持久化设置。
 */
export async function resetPluginLicenseActivation(
  plugin: LicenseCapablePluginLike | null | undefined,
  options?: { persist?: boolean }
): Promise<void> {
  clearPluginLocalLicenses(plugin);

  await PremiumFeatureGuard.getInstance().updateLicenseState({
    product: getPluginLicensedProduct(plugin),
    localLicenses: [],
  });

  if (options?.persist === false) {
    return;
  }

  if (typeof plugin?.saveSettings === "function") {
    await plugin.saveSettings();
  }

  if (plugin && "app" in plugin && plugin.app) {
    emitWeaveLicenseChanged(plugin.app);
  }
}
