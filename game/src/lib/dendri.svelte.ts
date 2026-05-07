import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

const MOVE_THROTTLE_MS = 33;
const DOT_SPAWN_MS = 2000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_RADIUS = 20;
const DOT_RADIUS = 10;
const PLAYER_SPEED = 5;
const MAX_DOTS = 20;
const INITIAL_DOTS = 5;

interface Player {
	x: number;
	y: number;
	color: string;
	name: string;
	score: number;
}

interface PlayerInput {
	x: number;
	y: number;
	color: string;
	name: string;
}

interface Dot {
	id: string;
	x: number;
	y: number;
	color: string;
}

function randomColor(): string {
	const hue = Math.floor(Math.random() * 360);
	return `hsl(${hue}, 70%, 60%)`;
}

function randomName(): string {
	const names = ["Fox", "Owl", "Bear", "Wolf", "Hawk", "Deer", "Lynx", "Hare", "Crow", "Seal"];
	return names[Math.floor(Math.random() * names.length)];
}

function randomDotColor(): string {
	const hue = Math.floor(Math.random() * 360);
	return `hsl(${hue}, 90%, 70%)`;
}

function generateDotId(): string {
	return `dot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function spawnDot(): Dot {
	return {
		id: generateDotId(),
		x: DOT_RADIUS + Math.random() * (CANVAS_WIDTH - DOT_RADIUS * 2),
		y: DOT_RADIUS + Math.random() * (CANVAS_HEIGHT - DOT_RADIUS * 2),
		color: randomDotColor(),
	};
}

function circlesOverlap(
	x1: number, y1: number, r1: number,
	x2: number, y2: number, r2: number,
): boolean {
	const dx = x1 - x2;
	const dy = y1 - y2;
	return Math.sqrt(dx * dx + dy * dy) < r1 + r2;
}

function resolveDendriOptions() {
	const url = env.PUBLIC_DENDRI_URL;
	if (!url) {
		return {
			host: "localhost",
			port: 9876,
			secure: false,
			path: "/",
			debug: 0,
			fetchTurnCredentials: true,
			enableRelay: true,
		};
	}
	const u = new URL(url);
	const isSecure = u.protocol === "https:";
	return {
		host: u.hostname,
		port: Number(u.port) || (isSecure ? 443 : 80),
		path: u.pathname || "/",
		secure: isSecure,
		apiKey: env.PUBLIC_DENDRI_API_KEY,
		debug: 0,
		fetchTurnCredentials: true,
			enableRelay: true,
	};
}

export function createGamePeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
		awareness: true,
	});

	const ydoc = peer.ydoc;
	const yscores = ydoc.getMap<number>("scores");
	const ydots = ydoc.getMap<Dot>("dots");
	const awareness = peer.awareness!;
	const myId = String(awareness.clientID);

	let players = $state<Record<string, Player>>({});
	let dots = $state<Dot[]>([]);

	const myColor = randomColor();
	const myName = randomName();

	let lastMoveTime = 0;
	const keysDown = new Set<string>();
	let touchDx = 0;
	let touchDy = 0;

	let dotSpawnInterval: ReturnType<typeof setInterval> | undefined;
	let gameLoopInterval: ReturnType<typeof setInterval> | undefined;
	let wasHost = false;

	function rebuildPlayers() {
		const updated: Record<string, Player> = {};
		for (const [clientId, state] of awareness.getStates()) {
			const id = String(clientId);
			const input = state["input"] as PlayerInput | undefined;
			if (!input) continue;
			updated[id] = {
				x: input.x,
				y: input.y,
				color: input.color,
				name: input.name,
				score: yscores.get(id) ?? 0,
			};
		}
		players = updated;
	}

	function rebuildDots() {
		dots = Array.from(ydots.values());
	}

	awareness.on("change", rebuildPlayers);
	yscores.observe(rebuildPlayers);
	ydots.observe(rebuildDots);

	// Detect host transitions to start/stop game loops.
	const unsubHostWatch = peer.store.subscribe(() => {
		const nowHost = peer.store.isHost;
		if (nowHost && !wasHost) startHostLoops();
		else if (!nowHost && wasHost) stopHostLoops();
		wasHost = nowHost;
	});

	function startHostLoops() {
		if (ydots.size === 0) {
			ydoc.transact(() => {
				for (let i = 0; i < INITIAL_DOTS; i++) {
					const dot = spawnDot();
					ydots.set(dot.id, dot);
				}
			});
		}

		dotSpawnInterval = setInterval(() => {
			if (ydots.size < MAX_DOTS) {
				const dot = spawnDot();
				ydots.set(dot.id, dot);
			}
		}, DOT_SPAWN_MS);

		gameLoopInterval = setInterval(checkCollisions, MOVE_THROTTLE_MS);
	}

	function stopHostLoops() {
		if (dotSpawnInterval !== undefined) {
			clearInterval(dotSpawnInterval);
			dotSpawnInterval = undefined;
		}
		if (gameLoopInterval !== undefined) {
			clearInterval(gameLoopInterval);
			gameLoopInterval = undefined;
		}
	}

	function checkCollisions() {
		if (!peer.isHost) return;

		const positions: Array<[string, PlayerInput]> = [];
		for (const [clientId, state] of awareness.getStates()) {
			const input = state["input"] as PlayerInput | undefined;
			if (input) positions.push([String(clientId), input]);
		}
		if (positions.length === 0) return;

		ydoc.transact(() => {
			for (const [dotId, dot] of ydots) {
				for (const [pid, pos] of positions) {
					if (circlesOverlap(pos.x, pos.y, PLAYER_RADIUS, dot.x, dot.y, DOT_RADIUS)) {
						yscores.set(pid, (yscores.get(pid) ?? 0) + 1);
						ydots.delete(dotId);
						break;
					}
				}
			}
		});
	}

	function connect(roomId: string) {
		peer.connect(roomId);

		const waitForJoin = () => {
			if (peer.connectionState === "connected") {
				const startX = PLAYER_RADIUS + Math.random() * (CANVAS_WIDTH - PLAYER_RADIUS * 2);
				const startY = PLAYER_RADIUS + Math.random() * (CANVAS_HEIGHT - PLAYER_RADIUS * 2);
				awareness.setLocalStateField("input", {
					x: startX, y: startY, color: myColor, name: myName,
				} satisfies PlayerInput);
			} else {
				setTimeout(waitForJoin, 100);
			}
		};
		waitForJoin();
	}

	function handleKeyDown(key: string) {
		keysDown.add(key.toLowerCase());
	}

	function handleKeyUp(key: string) {
		keysDown.delete(key.toLowerCase());
	}

	function setTouchDirection(dx: number, dy: number) {
		touchDx = dx;
		touchDy = dy;
	}

	function processMovement() {
		const me = awareness.getLocalState()?.["input"] as PlayerInput | undefined;
		if (!me) return;

		let dx = 0;
		let dy = 0;

		if (keysDown.has("arrowleft") || keysDown.has("a")) dx -= PLAYER_SPEED;
		if (keysDown.has("arrowright") || keysDown.has("d")) dx += PLAYER_SPEED;
		if (keysDown.has("arrowup") || keysDown.has("w")) dy -= PLAYER_SPEED;
		if (keysDown.has("arrowdown") || keysDown.has("s")) dy += PLAYER_SPEED;

		if (touchDx !== 0 || touchDy !== 0) {
			dx = touchDx * PLAYER_SPEED;
			dy = touchDy * PLAYER_SPEED;
		}

		if (dx === 0 && dy === 0) return;

		const newX = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, me.x + dx));
		const newY = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, me.y + dy));
		if (newX === me.x && newY === me.y) return;

		const now = Date.now();
		if (now - lastMoveTime < MOVE_THROTTLE_MS) return;
		lastMoveTime = now;

		awareness.setLocalStateField("input", {
			...me, x: newX, y: newY,
		} satisfies PlayerInput);
	}

	function disconnect() {
		stopHostLoops();
		unsubHostWatch();
		peer.destroy();
		players = {};
		dots = [];
		keysDown.clear();
	}

	return {
		get myId() { return myId; },
		get players() { return players; },
		get dots() { return dots; },
		get status() { return peer.status; },
		get isHost() { return peer.isHost; },
		get peerCount() { return peer.peerCount; },
		get myColor() { return myColor; },
		get myName() { return myName; },
		get canvasWidth() { return CANVAS_WIDTH; },
		get canvasHeight() { return CANVAS_HEIGHT; },
		get playerRadius() { return PLAYER_RADIUS; },
		get dotRadius() { return DOT_RADIUS; },
		connect,
		disconnect,
		handleKeyDown,
		handleKeyUp,
		setTouchDirection,
		processMovement,
	};
}
