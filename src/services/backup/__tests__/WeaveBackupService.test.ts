import { describe, expect, it } from "vitest";
import {
	BACKUP_PROTECTED_SUBDIRS,
	BACKUP_SLOT_AUTO,
	BACKUP_SLOT_MANUAL,
	isProtectedBackupSubdir,
} from "../WeaveBackupService";

describe("WeaveBackupService helpers", () => {
	describe("isProtectedBackupSubdir", () => {
		it("treats auto and manual slots as protected", () => {
			expect(isProtectedBackupSubdir(BACKUP_SLOT_AUTO)).toBe(true);
			expect(isProtectedBackupSubdir(BACKUP_SLOT_MANUAL)).toBe(true);
		});

		it("treats internal recovery directories as protected", () => {
			expect(isProtectedBackupSubdir("json-recovery")).toBe(true);
			expect(isProtectedBackupSubdir("config-recovery")).toBe(true);
			expect(isProtectedBackupSubdir("sync-conflicts")).toBe(true);
		});

		it("does not protect legacy timestamp backup folders", () => {
			expect(isProtectedBackupSubdir("2026-03-15T12-00-00-000Z")).toBe(false);
			expect(isProtectedBackupSubdir("backup-20260315")).toBe(false);
		});

		it("matches BACKUP_PROTECTED_SUBDIRS exactly", () => {
			for (const dir of BACKUP_PROTECTED_SUBDIRS) {
				expect(isProtectedBackupSubdir(dir)).toBe(true);
			}
		});
	});
});
