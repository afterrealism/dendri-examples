import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

const MAX_LOG_ENTRIES = 20;

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

interface PeerPresence {
	peerId: string;
	name: string;
	emoji: string;
	color: string;
	status: "online" | "idle" | "offline";
}

interface LogEntry {
	message: string;
	timestamp: number;
}

const EMOJIS = [
	"\uD83D\uDC31", "\uD83D\uDC36", "\uD83E\uDD8A", "\uD83D\uDC3B", "\uD83D\uDC27",
	"\uD83E\uDD89", "\uD83E\uDD81", "\uD83D\uDC2F", "\uD83D\uDC35", "\uD83D\uDC38",
	"\uD83E\uDD84", "\uD83D\uDC32", "\uD83E\uDD96", "\uD83D\uDC22", "\uD83D\uDC19",
	"\uD83E\uDD9E", "\uD83E\uDD8B", "\uD83D\uDC1D", "\uD83D\uDC26", "\uD83E\uDDA9",
];

const NAMES = [
	"Atlas", "Nova", "Sage", "Echo", "Onyx",
	"Iris", "Zephyr", "Coral", "Flint", "Luna",
	"Ember", "Drift", "Rune", "Fern", "Blaze",
	"Haze", "Crest", "Dusk", "Gale", "Pebble",
];

function randomEmoji(): string {
	return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function randomName(): string {
	return NAMES[Math.floor(Math.random() * NAMES.length)];
}

function randomColor(): string {
	const hue = Math.floor(Math.random() * 360);
	return `hsl(${hue}, 70%, 60%)`;
}

export function createPresencePeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
		awareness: true,
	});

	const awareness = peer.awareness!;
	const myClientId = String(awareness.clientID);

	let peers = $state<Record<string, PeerPresence>>({});
	let activityLog = $state<LogEntry[]>([]);
	let onlineCount = $derived(Object.keys(peers).length + 1);

	const myEmoji = randomEmoji();
	const myName = randomName();
	const myColor = randomColor();
	const knownPeers = new Set<string>();

	function addLogEntry(message: string) {
		const entry: LogEntry = { message, timestamp: Date.now() };
		activityLog = [entry, ...activityLog].slice(0, MAX_LOG_ENTRIES);
	}

	function rebuildPeers() {
		const updated: Record<string, PeerPresence> = {};
		const seen = new Set<string>();
		for (const [clientId, state] of awareness.getStates()) {
			const id = String(clientId);
			if (id === myClientId) continue;
			const p = state["presence"] as
				| { name?: string; emoji?: string; color?: string; status?: string }
				| undefined;
			if (!p) continue;
			seen.add(id);
			updated[id] = {
				peerId: id,
				name: p.name ?? "Unknown",
				emoji: p.emoji ?? "",
				color: p.color ?? "#888",
				status: (p.status as PeerPresence["status"]) ?? "online",
			};
			if (!knownPeers.has(id)) {
				knownPeers.add(id);
				addLogEntry(`${p.emoji ?? ""} ${p.name ?? "Unknown"} joined`);
			}
		}
		for (const id of knownPeers) {
			if (!seen.has(id)) {
				const leaving = peers[id];
				knownPeers.delete(id);
				if (leaving) addLogEntry(`${leaving.emoji} ${leaving.name} left`);
			}
		}
		peers = updated;
	}

	awareness.on("change", rebuildPeers);

	function connect(roomId: string) {
		peer.connect(roomId);

		const waitForJoin = () => {
			if (peer.connectionState === "connected") {
				awareness.setLocalStateField("presence", {
					name: myName, emoji: myEmoji, color: myColor, status: "online",
				});
				addLogEntry(`${myEmoji} ${myName} ${peer.isHost ? "created the room (host)" : "joined the room"}`);
			} else {
				setTimeout(waitForJoin, 100);
			}
		};
		waitForJoin();
	}

	function disconnect() {
		peer.destroy();
		peers = {};
		activityLog = [];
		knownPeers.clear();
	}

	return {
		get myId() { return myClientId; },
		get peers() { return peers; },
		get status() { return peer.status; },
		get isHost() { return peer.isHost; },
		get onlineCount() { return onlineCount; },
		get myEmoji() { return myEmoji; },
		get myName() { return myName; },
		get myColor() { return myColor; },
		get activityLog() { return activityLog; },
		connect,
		disconnect,
	};
}
