import {
	getCardManagementToolbarMirrorActions,
	resolveCardManagementMenuSurface,
	shouldHideCardManagementMenuActionBecauseToolbarAlreadyHandlesIt,
} from "./card-management-menu-policy";

describe("card-management-menu-policy", () => {
	it("优先将移动端识别为 mobile surface，避免套用桌面去重", () => {
		expect(resolveCardManagementMenuSurface({
			isMobile: true,
			isInSidebar: true,
		})).toBe("mobile");
	});

	it("能区分桌面内容区与桌面侧边栏", () => {
		expect(resolveCardManagementMenuSurface({
			isMobile: false,
			isInSidebar: false,
		})).toBe("desktop-main");

		expect(resolveCardManagementMenuSurface({
			isMobile: false,
			isInSidebar: true,
		})).toBe("desktop-sidebar");
	});

	it("桌面内容区表格记忆视图会把顶部已承担的局部操作加入去重集合", () => {
		const actions = getCardManagementToolbarMirrorActions({
			surface: "desktop-main",
			currentView: "table",
			cardDataSource: "memory",
		});

		expect(actions.has("data-source-switch")).toBe(true);
		expect(actions.has("table-view-basic")).toBe(true);
		expect(actions.has("table-view-review")).toBe(true);
		expect(actions.has("open-column-manager")).toBe(true);
		expect(actions.has("open-data-management")).toBe(true);
		expect(actions.has("grid-layout-timeline")).toBe(true);
	});

	it("桌面侧边栏只去重侧边栏顶部自己承担的两个就近操作", () => {
		const actions = getCardManagementToolbarMirrorActions({
			surface: "desktop-sidebar",
			currentView: "table",
			cardDataSource: "memory",
		});

		expect(actions.has("toggle-document-filter")).toBe(true);
  expect(actions.has("toggle-card-location-jump")).toBe(false);
		expect(actions.has("data-source-switch")).toBe(false);
		expect(actions.has("open-data-management")).toBe(false);
	});

	it("移动端不应因为桌面去重策略而隐藏菜单入口", () => {
		expect(shouldHideCardManagementMenuActionBecauseToolbarAlreadyHandlesIt({
			action: "data-source-switch",
			surface: "mobile",
			currentView: "table",
			cardDataSource: "memory",
		})).toBe(false);
	});

	it("桌面内容区会隐藏菜单中的重复入口，但桌面侧边栏不会误隐藏其他入口", () => {
		expect(shouldHideCardManagementMenuActionBecauseToolbarAlreadyHandlesIt({
			action: "data-source-switch",
			surface: "desktop-main",
			currentView: "table",
			cardDataSource: "memory",
		})).toBe(true);

		expect(shouldHideCardManagementMenuActionBecauseToolbarAlreadyHandlesIt({
			action: "open-column-manager",
			surface: "desktop-sidebar",
			currentView: "table",
			cardDataSource: "memory",
		})).toBe(false);
	});
});
