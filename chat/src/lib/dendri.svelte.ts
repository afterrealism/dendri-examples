import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

interface ChatMessage {
	sender: string;
	text: string;
	timestamp: number;
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

export function createPeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
	});

	const ymessages = peer.ydoc.getArray<ChatMessage>("messages");

	let messages = $state<ChatMessage[]>([]);
	let error = $state<string | null>(null);

	ymessages.observe(() => {
		messages = ymessages.toArray();
	});

	function connect(roomId: string) {
		error = null;
		peer.connect(roomId);
	}

	function sendMessage(text: string) {
		const myPeerId = peer.store.myPeerId;
		if (!myPeerId) return;
		ymessages.push([{ sender: myPeerId, text, timestamp: Date.now() }]);
	}

	function disconnect() {
		peer.ydoc.transact(() => ymessages.delete(0, ymessages.length));
		peer.destroy();
		error = null;
	}

	return {
		get myId() { return peer.store.myPeerId ?? ""; },
		get messages() { return messages; },
		get status() { return peer.status; },
		get connectionState() { return peer.connectionState; },
		get isHost() { return peer.isHost; },
		get error() { return error; },
		get peerCount() { return peer.peerCount; },
		connect,
		sendMessage,
		disconnect,
	};
}
