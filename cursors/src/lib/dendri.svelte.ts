import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

const CURSOR_THROTTLE_MS = 50;

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

interface CursorPosition {
	x: number;
	y: number;
	color: string;
	name: string;
	timestamp: number;
}

function randomColor(): string {
	const hue = Math.floor(Math.random() * 360);
	return `hsl(${hue}, 70%, 60%)`;
}

function randomName(): string {
	const names = ["Fox", "Owl", "Bear", "Wolf", "Hawk", "Deer", "Lynx", "Hare", "Crow", "Seal"];
	return names[Math.floor(Math.random() * names.length)];
}

export function createCursorPeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
		awareness: true,
	});

	const awareness = peer.awareness!;
	const myClientId = String(awareness.clientID);

	let cursors = $state<Record<string, CursorPosition>>({});
	let myCursor = $state<CursorPosition | null>(null);

	const myColor = randomColor();
	const myName = randomName();
	let lastBroadcastTime = 0;

	function rebuildCursors() {
		const updated: Record<string, CursorPosition> = {};
		for (const [clientId, state] of awareness.getStates()) {
			const id = String(clientId);
			if (id === myClientId) continue;
			const cursor = state["cursor"] as CursorPosition | undefined;
			if (!cursor) continue;
			updated[id] = cursor;
		}
		if (myCursor) updated[myClientId] = myCursor;
		cursors = updated;
	}

	awareness.on("change", rebuildCursors);

	function connect(roomId: string) {
		peer.connect(roomId);
	}

	function broadcastCursor(x: number, y: number) {
		const now = Date.now();
		myCursor = { x, y, color: myColor, name: myName, timestamp: now };
		rebuildCursors();
		if (now - lastBroadcastTime < CURSOR_THROTTLE_MS) return;
		lastBroadcastTime = now;
		awareness.setLocalStateField("cursor", myCursor);
	}

	function broadcastCursorLeave() {
		myCursor = null;
		awareness.setLocalStateField("cursor", null);
		rebuildCursors();
	}

	function disconnect() {
		peer.destroy();
		cursors = {};
		myCursor = null;
	}

	return {
		get myId() { return myClientId; },
		get cursors() { return cursors; },
		get status() { return peer.status; },
		get isHost() { return peer.isHost; },
		get peerCount() { return peer.peerCount; },
		get myColor() { return myColor; },
		get myName() { return myName; },
		connect, disconnect, broadcastCursor, broadcastCursorLeave,
	};
}
