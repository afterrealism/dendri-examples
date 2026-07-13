import Dendri from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";
import { createYjsPeer } from "./yjs-peer.svelte";
import * as Y from "yjs";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import { peerColor } from "./colors";

function resolveDendriOptions() {
	const url = env.PUBLIC_DENDRI_URL;
	if (!url) {
		return {
			host: "localhost",
			port: 9876,
			secure: false,
			path: "/",
			apiKey: env.PUBLIC_DENDRI_API_KEY,
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

// =============================================================================
// Collaborative GeoJSON editor — Yjs ↔ EditableGeoJsonLayer bridge.
//
// Y.Doc shape:
//   yfeatures : Y.Array<Y.Map<unknown>>
//     each Y.Map carries:
//       geometry   : geojson Geometry  (last-write-wins per field)
//       properties : Record<string,unknown>
//   yviewport : Y.Map<unknown>  { longitude, latitude, zoom, bearing, pitch }
//
// Awareness state per peer:
//   cursor   : { lon, lat } | null   (throttled mouse position on map)
//   mode     : string                (active edit mode id)
//   selection: number[]              (selected feature indexes — local-only intent)
//   color    : string                (deterministic from peerId)
//   name     : string                (short label)
//
// Loop-prevention: every local mutation is wrapped in
//   ydoc.transact(fn, "local")
// and observers ignore txn.origin === "local". Remote/sync transactions
// rebuild the Svelte $state, which in turn re-renders the deck.gl layer.
// =============================================================================

export interface ViewState {
	longitude: number;
	latitude: number;
	zoom: number;
	bearing: number;
	pitch: number;
}

export interface PeerPresence {
	id: string;
	color: string;
	name: string;
	cursor: { lon: number; lat: number } | null;
	mode: string;
	selection: number[];
}

const DEFAULT_VIEW: ViewState = {
	longitude: -122.45,
	latitude: 37.78,
	zoom: 12,
	bearing: 0,
	pitch: 0,
};

const CURSOR_THROTTLE_MS = 50;
const VIEWPORT_THROTTLE_MS = 50;

/** Origin tag to disambiguate our own mutations from remote/sync ones. */
const LOCAL_ORIGIN = Symbol("local");

interface EditorOptions {
	host?: string;
	port?: number;
	secure?: boolean;
	path?: string;
	apiKey?: string;
	debug?: number;
}

export function createCollaborativeEditor(options: EditorOptions = {}) {
	const defaults = resolveDendriOptions();
	const peer = createYjsPeer({
		DendriCtor: Dendri,
		dendriOptions: {
			host: options.host ?? defaults.host,
			port: options.port ?? defaults.port,
			secure: options.secure ?? defaults.secure,
			path: options.path ?? defaults.path,
			apiKey: options.apiKey ?? defaults.apiKey,
			debug: options.debug ?? defaults.debug,
			fetchTurnCredentials: true,
			enableRelay: true,
		},
		awareness: true,
	});

	const ydoc = peer.ydoc;
	const yfeatures = ydoc.getArray<Y.Map<unknown>>("features");
	const yviewport = ydoc.getMap<unknown>("viewport");
	const awareness = peer.awareness!;

	let data = $state<FeatureCollection>({
		type: "FeatureCollection",
		features: [],
	});
	let viewport = $state<ViewState>({ ...DEFAULT_VIEW });
	let peers = $state<PeerPresence[]>([]);

	// Local presence (mirrored into awareness)
	let myMode = $state<string>("draw-polygon");
	let mySelection = $state<number[]>([]);
	let myName = $state<string>("");

	// Throttle bookkeeping
	let lastCursorMs = 0;
	let lastViewportMs = 0;

	// =============== Y.Doc → Svelte $state ===============
	function rebuildData() {
		const features: Feature[] = [];
		for (let i = 0; i < yfeatures.length; i++) {
			const ym = yfeatures.get(i);
			if (!ym) continue;
			const geometry = ym.get("geometry") as Geometry | undefined;
			const properties = (ym.get("properties") as Record<
				string,
				unknown
			>) ?? {};
			if (!geometry) continue;
			features.push({ type: "Feature", geometry, properties });
		}
		data = { type: "FeatureCollection", features };
	}

	function rebuildViewport() {
		if (yviewport.size === 0) return;
		viewport = {
			longitude: (yviewport.get("longitude") as number) ?? DEFAULT_VIEW.longitude,
			latitude: (yviewport.get("latitude") as number) ?? DEFAULT_VIEW.latitude,
			zoom: (yviewport.get("zoom") as number) ?? DEFAULT_VIEW.zoom,
			bearing: (yviewport.get("bearing") as number) ?? DEFAULT_VIEW.bearing,
			pitch: (yviewport.get("pitch") as number) ?? DEFAULT_VIEW.pitch,
		};
	}

	function rebuildPeers() {
		const states = awareness.getStates();
		const me = awareness.clientID;
		const next: PeerPresence[] = [];
		for (const [clientID, raw] of states.entries()) {
			if (clientID === me) continue;
			const s = raw as Partial<PeerPresence> & { id?: string };
			const id = s.id ?? String(clientID);
			next.push({
				id,
				color: s.color ?? peerColor(id),
				name: s.name ?? id.slice(0, 6),
				cursor: s.cursor ?? null,
				mode: s.mode ?? "view",
				selection: s.selection ?? [],
			});
		}
		peers = next;
	}

	yfeatures.observeDeep((_events, txn) => {
		if (txn.origin === LOCAL_ORIGIN) return;
		rebuildData();
	});
	yviewport.observe((_event, txn) => {
		if (txn.origin === LOCAL_ORIGIN) return;
		rebuildViewport();
	});
	awareness.on("change", rebuildPeers);

	// =============== Local edit → Y.Doc ===============

	/**
	 * Applies an EditableGeoJsonLayer onEdit event to the Y.Doc.
	 *
	 * The layer hands us the WHOLE updated FeatureCollection plus a hint
	 * (editType + editContext.featureIndexes). We diff against the current
	 * Y state and emit per-feature mutations so concurrent edits on
	 * different features don't clobber each other.
	 */
	function applyLocalEdit(
		updatedData: FeatureCollection,
		editType: string,
		editContext: { featureIndexes?: number[] } | null | undefined,
	) {
		// Mirror locally first so the active drag stays smooth.
		data = updatedData;

		ydoc.transact(() => {
			const newLen = updatedData.features.length;
			const oldLen = yfeatures.length;

			// Update touched features in place.
			const touched = new Set(editContext?.featureIndexes ?? []);
			for (const idx of touched) {
				if (idx < 0 || idx >= newLen) continue;
				const f = updatedData.features[idx];
				if (idx < oldLen) {
					const ym = yfeatures.get(idx)!;
					ym.set("geometry", f.geometry);
					ym.set("properties", f.properties ?? {});
				}
			}

			// Append new features (e.g. after addFeature / draw completion).
			if (newLen > oldLen) {
				for (let i = oldLen; i < newLen; i++) {
					const f = updatedData.features[i];
					const ym = new Y.Map<unknown>();
					ym.set("geometry", f.geometry);
					ym.set("properties", f.properties ?? {});
					yfeatures.push([ym]);
				}
			} else if (newLen < oldLen) {
				// Removed at the tail (rare path through onEdit; mostly we use
				// removeFeature() below for sidebar-driven deletes).
				yfeatures.delete(newLen, oldLen - newLen);
			}
		}, LOCAL_ORIGIN);
	}

	/** Sidebar-driven delete (not routed through EditableGeoJsonLayer.onEdit). */
	function removeFeature(index: number) {
		if (index < 0 || index >= yfeatures.length) return;
		ydoc.transact(() => yfeatures.delete(index, 1), LOCAL_ORIGIN);
		data = {
			type: "FeatureCollection",
			features: data.features.filter((_, i) => i !== index),
		};
		// Drop selection if it pointed at the deleted feature.
		mySelection = mySelection
			.filter((i) => i !== index)
			.map((i) => (i > index ? i - 1 : i));
		publishAwareness();
	}

	function clearAllFeatures() {
		ydoc.transact(() => yfeatures.delete(0, yfeatures.length), LOCAL_ORIGIN);
		data = { type: "FeatureCollection", features: [] };
		mySelection = [];
		publishAwareness();
	}

	function setViewport(next: ViewState, opts: { force?: boolean } = {}) {
		const now = Date.now();
		viewport = next;
		if (!opts.force && now - lastViewportMs < VIEWPORT_THROTTLE_MS) return;
		lastViewportMs = now;
		ydoc.transact(() => {
			yviewport.set("longitude", next.longitude);
			yviewport.set("latitude", next.latitude);
			yviewport.set("zoom", next.zoom);
			yviewport.set("bearing", next.bearing);
			yviewport.set("pitch", next.pitch);
		}, LOCAL_ORIGIN);
	}

	function publishAwareness() {
		const id = peer.store.myPeerId ?? String(awareness.clientID);
		awareness.setLocalState({
			id,
			color: peerColor(id),
			name: myName || id.slice(0, 6),
			cursor: (awareness.getLocalState() as PeerPresence | null)?.cursor ??
				null,
			mode: myMode,
			selection: mySelection,
		});
	}

	function setCursor(lon: number | null, lat: number | null) {
		const now = Date.now();
		if (lon === null || lat === null) {
			const cur = awareness.getLocalState() as PeerPresence | null;
			awareness.setLocalState({ ...(cur ?? {}), cursor: null });
			return;
		}
		if (now - lastCursorMs < CURSOR_THROTTLE_MS) return;
		lastCursorMs = now;
		const cur = awareness.getLocalState() as PeerPresence | null;
		awareness.setLocalState({ ...(cur ?? {}), cursor: { lon, lat } });
	}

	function setMode(id: string) {
		myMode = id;
		// Switching mode resets selection (mirrors single-user reference).
		mySelection = [];
		publishAwareness();
	}

	function setSelection(idxs: number[]) {
		mySelection = idxs;
		publishAwareness();
	}

	function setName(name: string) {
		myName = name;
		publishAwareness();
	}

	function selectFeature(index: number) {
		setSelection([index]);
	}

	function connect(roomId: string, name?: string) {
		if (name) myName = name;
		peer.connect(roomId);
		// Publish initial presence so other peers see us immediately.
		publishAwareness();
	}

	function disconnect() {
		try {
			awareness.setLocalState(null);
		} catch {
			// Awareness may already be torn down.
		}
		peer.destroy();
	}

	return {
		// reactive getters
		get data() {
			return data;
		},
		get viewport() {
			return viewport;
		},
		get peers() {
			return peers;
		},
		get myMode() {
			return myMode;
		},
		get mySelection() {
			return mySelection;
		},
		get myId() {
			return peer.store.myPeerId ?? "";
		},
		get myColor() {
			return peerColor(peer.store.myPeerId ?? String(awareness.clientID));
		},
		get connectionState() {
			return peer.connectionState;
		},
		get isHost() {
			return peer.isHost;
		},
		get peerCount() {
			return peer.peerCount;
		},

		// methods
		connect,
		disconnect,
		applyLocalEdit,
		removeFeature,
		clearAllFeatures,
		setViewport,
		setCursor,
		setMode,
		setSelection,
		setName,
		selectFeature,
	};
}

export type CollaborativeEditor = ReturnType<typeof createCollaborativeEditor>;
