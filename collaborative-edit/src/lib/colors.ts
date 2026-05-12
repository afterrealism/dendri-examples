/**
 * Deterministic color from a peer id. Same id always yields the same hue,
 * so peers see consistent colors for each other across sessions.
 */
const PALETTE = [
	"#ef4444", // red
	"#f97316", // orange
	"#eab308", // yellow
	"#22c55e", // green
	"#06b6d4", // cyan
	"#3b82f6", // blue
	"#8b5cf6", // violet
	"#ec4899", // pink
];

export function peerColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}
	return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Convert "#rrggbb" → [r, g, b] in 0–255 range. */
export function hexToRgb(hex: string): [number, number, number] {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return [0, 0, 0];
	return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
