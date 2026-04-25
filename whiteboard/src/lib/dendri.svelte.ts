import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

interface StrokePoint {
	x: number;
	y: number;
}

interface Stroke {
	points: StrokePoint[];
	color: string;
	size: number;
	peerId: string;
}

export type { StrokePoint, Stroke };

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

export function createWhiteboardPeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
	});

	const ystrokes = peer.ydoc.getArray<Stroke>("strokes");

	let strokes = $state<Stroke[]>([]);

	ystrokes.observe(() => {
		strokes = ystrokes.toArray();
	});

	function connect(roomId: string) {
		peer.connect(roomId);
	}

	function broadcastStroke(points: StrokePoint[], color: string, size: number) {
		const peerId = peer.store.myPeerId ?? "";
		ystrokes.push([{ points, color, size, peerId }]);
	}

	function broadcastClear() {
		peer.ydoc.transact(() => ystrokes.delete(0, ystrokes.length));
	}

	function disconnect() {
		peer.ydoc.transact(() => ystrokes.delete(0, ystrokes.length));
		peer.destroy();
	}

	return {
		get myId() { return peer.store.myPeerId ?? ""; },
		get strokes() { return strokes; },
		get status() { return peer.status; },
		get connectionState() { return peer.connectionState; },
		get isHost() { return peer.isHost; },
		get peerCount() { return peer.peerCount; },
		connect,
		disconnect,
		broadcastStroke,
		broadcastClear,
	};
}
