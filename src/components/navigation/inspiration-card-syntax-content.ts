export type {
	CardSyntaxBlock,
	CardSyntaxTutorial,
	InspirationItem,
	InspirationLink,
	InspirationModalContent,
	InspirationModalTab,
	InspirationModalTabId,
	InspirationSection,
} from "./inspiration-types";

import { i18n } from "../../utils/i18n";
import { getInspirationModalLocaleContent } from "../../utils/i18n/resources/inspiration-modal";
import type { InspirationModalContent } from "./inspiration-types";

export function getInspirationModalContent(): InspirationModalContent {
	return getInspirationModalLocaleContent(i18n.getCurrentLanguage());
}
