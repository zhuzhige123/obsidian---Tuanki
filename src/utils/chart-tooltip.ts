interface ChartTooltipSize {
	viewSize?: [number, number];
	contentSize?: [number, number];
}

export function getMobileChartTooltipPosition(
	point: number[],
	_params: unknown,
	_dom: HTMLElement,
	_rect: unknown,
	size: ChartTooltipSize
): [number, number] {
	const viewWidth = Number(size?.viewSize?.[0] ?? 0);
	const contentWidth = Number(size?.contentSize?.[0] ?? 0);
	const contentHeight = Number(size?.contentSize?.[1] ?? 0);
	const anchorX = Number(point?.[0] ?? 0);
	const anchorY = Number(point?.[1] ?? 0);
	const minX = 10;
	const maxX = Math.max(minX, viewWidth - contentWidth - 10);
	let x = anchorX - contentWidth / 2;
	if (x < minX) x = minX;
	if (x > maxX) x = maxX;
	let y = anchorY - contentHeight - 30;
	if (y < 10) y = 10;
	return [x, y];
}
