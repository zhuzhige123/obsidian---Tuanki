import { requestUrl } from "obsidian";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import {
	runWithAIRequestSlot,
	withAIRequestTimeout,
} from "./ai-request-policy";

export type AIHttpRequest = RequestUrlParam;
export type AIHttpResponse = RequestUrlResponse;

/**
 * AI 服务统一通过这个适配层访问 Obsidian 的网络能力。
 * 这样 provider 实现不再直接依赖 `obsidian` 模块，后续更容易统一维护。
 */
export async function sendAIHttpRequest(request: AIHttpRequest): Promise<AIHttpResponse> {
	return runWithAIRequestSlot(() =>
		withAIRequestTimeout(() => requestUrl(request))
	);
}
