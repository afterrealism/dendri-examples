import {
	ConnectionState,
	createDendriStore,
	type DendriOptions,
	type DendriStore,
} from "@afterrealism/dendri-client";
import type Dendri from "@afterrealism/dendri-client";
import { DendriYjsProvider } from "@afterrealism/dendri-y";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

export type PeerStatus = "disconnected" | "connecting" | "connected";

export interface YjsPeerOptions {
	DendriCtor: typeof Dendri;
	dendriOptions: DendriOptions;
	awareness?: boolean;
}

export interface YjsPeer {
	readonly ydoc: Y.Doc;
	readonly awareness: Awareness | null;
	readonly store: DendriStore;
	readonly provider: DendriYjsProvider | null;
	readonly isHost: boolean;
	readonly peerCount: number;
	readonly connectionState: ConnectionState;
	readonly status: PeerStatus;
	readonly myClientId: number | null;
	connect(roomId: string): void;
	disconnect(): void;
	destroy(): void;
}

export function createYjsPeer(opts: YjsPeerOptions): YjsPeer {
	const store = createDendriStore({
		DendriCtor: opts.DendriCtor,
		dendriOptions: opts.dendriOptions,
	});
	const ydoc = new Y.Doc();
	const awareness = opts.awareness ? new Awareness(ydoc) : null;
	let provider: DendriYjsProvider | null = null;

	let isHost = $state(false);
	let peerCount = $state(0);
	let connectionState = $state<ConnectionState>(ConnectionState.Initialized);

	const sync = () => {
		isHost = store.isHost;
		peerCount = store.peerCount;
		connectionState = store.connectionState;
	};

	const unsubStore = store.subscribe(sync);
	const offJoin = store.onPeerJoin(sync);
	const offLeave = store.onPeerLeave(sync);

	function disconnect() {
		provider?.destroy();
		provider = null;
	}

	function destroy() {
		disconnect();
		offJoin();
		offLeave();
		unsubStore();
		awareness?.destroy();
		ydoc.destroy();
		store.destroy();
	}

	return {
		get ydoc() {
			return ydoc;
		},
		get awareness() {
			return awareness;
		},
		get store() {
			return store;
		},
		get provider() {
			return provider;
		},
		get isHost() {
			return isHost;
		},
		get peerCount() {
			return peerCount;
		},
		get connectionState() {
			return connectionState;
		},
		get status() {
			if (connectionState === ConnectionState.Connected) return "connected";
			if (
				connectionState === ConnectionState.Connecting ||
				connectionState === ConnectionState.Initialized
			) {
				return "connecting";
			}
			return "disconnected";
		},
		get myClientId() {
			return awareness?.clientID ?? null;
		},
		connect(roomId: string) {
			provider = new DendriYjsProvider({
				room: store,
				doc: ydoc,
				...(awareness ? { awareness } : {}),
			});
			store.join(roomId);
		},
		disconnect,
		destroy,
	};
}
