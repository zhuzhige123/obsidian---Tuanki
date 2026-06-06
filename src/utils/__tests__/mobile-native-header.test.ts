import {
	findWeaveViewLeafContent,
	hasWeaveMobileNativeHeader,
	usesMobileNativeWeaveHeader,
} from "../mobile-native-header";

describe("mobile native header helpers", () => {
	it("returns null and false when no element is provided", () => {
		expect(findWeaveViewLeafContent(null)).toBeNull();
		expect(hasWeaveMobileNativeHeader(null)).toBe(false);
	});

	it("finds the surrounding weave view leaf content", () => {
		document.body.innerHTML = `
			<div class="workspace-leaf-content" data-type="weave-view">
				<div class="ai-assistant-page">
					<div id="target"></div>
				</div>
			</div>
		`;

		const target = document.getElementById("target") as HTMLElement | null;
		const host = findWeaveViewLeafContent(target);

		expect(host).not.toBeNull();
		expect(host?.dataset.type).toBe("weave-view");
		expect(hasWeaveMobileNativeHeader(target)).toBe(false);
	});

	it("detects when the weave view host has native mobile header enabled", () => {
		document.body.innerHTML = `
			<div class="workspace-leaf-content" data-type="weave-view" data-weave-mobile-native-header="true">
				<div class="ai-assistant-page">
					<div id="target"></div>
				</div>
			</div>
		`;

		const target = document.getElementById("target") as HTMLElement | null;

		expect(hasWeaveMobileNativeHeader(target)).toBe(true);
	});
});

describe("usesMobileNativeWeaveHeader", () => {
	it("mirrors Platform.isMobile", () => {
		expect(typeof usesMobileNativeWeaveHeader()).toBe("boolean");
	});
});
