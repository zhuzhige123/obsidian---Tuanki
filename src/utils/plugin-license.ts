import type { EffectiveLicenseState, LicenseInfo, LicenseStore, LicensedProduct } from "../types/license";
import {
  getLegacyPrimaryLicense,
  getProductFromPluginId,
  normalizeLicenseStore,
  resolveEffectiveLicenseState,
} from "./license-state";

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
}

export function getPluginLicensedProduct(plugin: LicenseCapablePluginLike | null | undefined): LicensedProduct {
  return plugin?.getLicensedProductId?.() ?? getProductFromPluginId(plugin?.manifest?.id);
}

export function getPluginLocalLicenses(plugin: LicenseCapablePluginLike | null | undefined): LicenseInfo[] {
  if (!plugin) {
    return [];
  }

  if (typeof plugin.getLocalLicenses === "function") {
    return plugin.getLocalLicenses();
  }

  return normalizeLicenseStore(plugin.settings?.license, plugin.settings?.licenseState).localLicenses;
}

export function getPluginEffectiveLicenseState(
  plugin: LicenseCapablePluginLike | null | undefined
): EffectiveLicenseState {
  if (plugin?.getEffectiveLicenseState) {
    return plugin.getEffectiveLicenseState();
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
  syncPluginLicenseSettings(plugin);
}
