import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";

function resolveDendriOptions() {
	const url = env.PUBLIC_DENDRI_URL;
	if (!url) {
		return {
			host: "localhost",
			port: 9876,
			secure: false,
			path: "/",
			debug: 0,
			fetchTurnCredentials: false,
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
		fetchTurnCredentials: false,
	};
}

export type LayerId = "scatter" | "heatmap" | "column";

export interface LayerSettings {
	visible: boolean;
	opacity: number;
	scale: number;
}

export type LayersState = Record<LayerId, LayerSettings>;

const DEFAULTS: LayersState = {
	scatter: { visible: true, opacity: 0.8, scale: 1.0 },
	heatmap: { visible: true, opacity: 0.6, scale: 1.0 },
	column: { visible: false, opacity: 0.7, scale: 1.0 },
};

const LAYER_IDS: readonly LayerId[] = ["scatter", "heatmap", "column"] as const;
const PROPS: readonly (keyof LayerSettings)[] = ["visible", "opacity", "scale"] as const;

function key(id: LayerId, prop: keyof LayerSettings): string {
	return `${id}.${prop}`;
}

function readSettings(map: import("yjs").Map<unknown>): LayersState {
	const out = {} as LayersState;
	for (const id of LAYER_IDS) {
		out[id] = { ...DEFAULTS[id] };
		for (const prop of PROPS) {
			const v = map.get(key(id, prop));
			if (v !== undefined) {
				(out[id] as Record<string, unknown>)[prop] = v;
			}
		}
	}
	return out;
}

export function createMapPeer() {
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: resolveDendriOptions(),
		awareness: false,
	});

	const settingsMap = peer.ydoc.getMap<unknown>("layer-settings");
	let layers = $state<LayersState>(structuredClone(DEFAULTS));

	function sync() {
		layers = readSettings(settingsMap);
	}

	settingsMap.observe(sync);

	function connect(roomId: string) {
		peer.connect(roomId);
		sync();
	}

	function setLayerProp<K extends keyof LayerSettings>(
		id: LayerId,
		prop: K,
		value: LayerSettings[K],
	) {
		settingsMap.set(key(id, prop), value);
	}

	function disconnect() {
		peer.destroy();
	}

	return {
		get layers() { return layers; },
		get status() { return peer.status; },
		get isHost() { return peer.isHost; },
		get peerCount() { return peer.peerCount; },
		connect,
		disconnect,
		setLayerProp,
	};
}
