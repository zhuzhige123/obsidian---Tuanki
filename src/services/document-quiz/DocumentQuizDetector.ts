import { parseYAMLFromContent } from "../../utils/yaml-utils";
import { hasPotentialDocumentQuizContent } from "./DocumentQuizParser";

export function isDocumentQuizFrontmatterEnabled(content: string): boolean {
	const yaml = parseYAMLFromContent(content);
	if (!yaml) {
		return false;
	}
	const flag = yaml["weave-doc-quiz"];
	return flag === true || flag === "true" || flag === 1;
}

export function shouldShowDocumentQuizEntry(content: string): boolean {
	return isDocumentQuizFrontmatterEnabled(content) || hasPotentialDocumentQuizContent(content);
}
