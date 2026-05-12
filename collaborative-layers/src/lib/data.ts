export interface Point {
	position: [number, number];
	weight: number;
	name: string;
}

const NAMES = [
	"Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel",
	"India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa",
	"Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey",
	"X-ray", "Yankee", "Zulu",
];

function seeded(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0xffffffff;
	};
}

export function generatePoints(count: number, center: [number, number], spread = 0.6): Point[] {
	const rand = seeded(0xdeadbeef);
	const points: Point[] = [];
	for (let i = 0; i < count; i++) {
		const angle = rand() * Math.PI * 2;
		const r = Math.sqrt(rand()) * spread;
		points.push({
			position: [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r * 0.7],
			weight: Math.round(rand() * 100),
			name: NAMES[i % NAMES.length] + "-" + i,
		});
	}
	return points;
}

export const SEATTLE: [number, number] = [-122.33, 47.6];
