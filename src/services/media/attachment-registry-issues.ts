export interface AttachmentRegistryAutoFixScanSlice {
	brokenPaths: string[];
	rewritablePaths: Array<{ rawPath: string; canonicalPath: string }>;
	isRegistryStale: boolean;
}

/** 默认修复可处理的问题数（路径规范化、索引过期）；不含本地暂不可用与媒体孤儿 */
export function getAttachmentRegistryAutoFixIssueCount(
	scan: Pick<AttachmentRegistryAutoFixScanSlice, "rewritablePaths" | "isRegistryStale">
): number {
	return scan.rewritablePaths.length + (scan.isRegistryStale ? 1 : 0);
}

/** @deprecated 使用 getAttachmentRegistryAutoFixIssueCount */
export function getAttachmentRegistryActionableIssueCount(
	scan: AttachmentRegistryAutoFixScanSlice
): number {
	return getAttachmentRegistryAutoFixIssueCount(scan);
}
