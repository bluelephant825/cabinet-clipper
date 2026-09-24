export interface SVGConfig {
	width?: string;
	height?: string;
	viewBox?: string;
	className?: string;
	strokeWidth?: string;
	paths?: string[];
	lines?: Array<{ x1: string; y1: string; x2: string; y2: string }>;
	circles?: Array<{ cx: string; cy: string; r: string; fill?: string }>;
	rects?: Array<{ x: string; y: string; width: string; height: string; rx?: string; ry?: string }>;
}

/**
 * Helper function to construct SVG DOM elements programmatically.
 */
export function createSVG(config: SVGConfig): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

	if (config.width) svg.setAttribute('width', config.width);
	if (config.height) svg.setAttribute('height', config.height);
	if (config.viewBox) svg.setAttribute('viewBox', config.viewBox);
	if (config.className) svg.setAttribute('class', config.className);

	// Default attributes for all SVGs
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', config.strokeWidth || '1.5');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');

	// Add paths
	if (config.paths) {
		config.paths.forEach((pathData) => {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', pathData);
			svg.appendChild(path);
		});
	}

	// Add lines
	if (config.lines) {
		config.lines.forEach((lineData) => {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', lineData.x1);
			line.setAttribute('y1', lineData.y1);
			line.setAttribute('x2', lineData.x2);
			line.setAttribute('y2', lineData.y2);
			svg.appendChild(line);
		});
	}

	// Add circles
	if (config.circles) {
		config.circles.forEach((circleData) => {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', circleData.cx);
			circle.setAttribute('cy', circleData.cy);
			circle.setAttribute('r', circleData.r);
			if (circleData.fill) circle.setAttribute('fill', circleData.fill);
			svg.appendChild(circle);
		});
	}

	// Add rects
	if (config.rects) {
		config.rects.forEach((rectData) => {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', rectData.x);
			rect.setAttribute('y', rectData.y);
			rect.setAttribute('width', rectData.width);
			rect.setAttribute('height', rectData.height);
			if (rectData.rx) rect.setAttribute('rx', rectData.rx);
			if (rectData.ry) rect.setAttribute('ry', rectData.ry);
			svg.appendChild(rect);
		});
	}

	return svg;
}
