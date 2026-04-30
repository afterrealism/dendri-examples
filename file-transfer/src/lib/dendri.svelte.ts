import Dendri, { ConnectionState, type HybridConnection } from "@afterrealism/dendri-client";
import type { DataConnection } from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";

const APP_CHUNK_SIZE = 64 * 1024; // 64 KB application-level chunks for progress tracking

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

interface FileMeta {
	type: "file-meta";
	name: string;
	size: number;
	mimeType: string;
	totalChunks: number;
}

interface FileChunk {
	type: "file-chunk";
	index: number;
	data: ArrayBuffer;
}

interface FileComplete {
	type: "file-complete";
}

type FileMessage = FileMeta | FileChunk | FileComplete;

export interface TransferRecord {
	readonly id: string;
	readonly fileName: string;
	readonly fileSize: number;
	readonly mimeType: string;
	readonly direction: "send" | "receive";
	readonly startTime: number;
	bytesTransferred: number;
	status: "pending" | "transferring" | "complete" | "error";
	speed: number;
	blobUrl: string | null;
	errorMessage: string | null;
}

function createTransferRecord(
	fileName: string,
	fileSize: number,
	mimeType: string,
	direction: "send" | "receive",
): TransferRecord {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		fileName,
		fileSize,
		mimeType,
		direction,
		startTime: Date.now(),
		bytesTransferred: 0,
		status: "pending",
		speed: 0,
		blobUrl: null,
		errorMessage: null,
	};
}

function computeSpeed(transfer: Readonly<Pick<TransferRecord, "startTime" | "bytesTransferred">>): number {
	const elapsed = (Date.now() - transfer.startTime) / 1000;
	if (elapsed <= 0) return 0;
	return transfer.bytesTransferred / elapsed;
}

function updateTransferAt(list: TransferRecord[], idx: number, patch: Partial<TransferRecord>): TransferRecord[] {
	const updated = { ...list[idx], ...patch };
	return [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
}

export function createPeer() {
	let peer = $state<Dendri | null>(null);
	let myId = $state("");
	let connection = $state<DataConnection | null>(null);
	let hybridConn = $state<HybridConnection | null>(null);
	let transfers = $state<TransferRecord[]>([]);
	let connectionState = $state<ConnectionState>(ConnectionState.Initialized);
	let error = $state<string | null>(null);
	let remotePeerConnected = $state(false);
	/** The remote peer's ID when connected via relay (no WebRTC). */
	let relayPeerId = $state<string | null>(null);
	/** Room name shared across all file-transfer peers for fan-out relay. */
	const ROOM = "dendri-ft-room";

	// Receive-side accumulation state (not exposed directly)
	let pendingMeta: FileMeta | null = null;
	let receiveChunks: ArrayBuffer[] = [];
	let receiveTransferIndex: number = -1;

	function connect() {
		connectionState = ConnectionState.Connecting;
		error = null;

		const p = new Dendri(resolveDendriOptions());

		p.on("open", (id) => {
			myId = id;
			connectionState = ConnectionState.Connected;
			peer = p;
			// Join the shared room so relay DATA fans out to all peers.
			p.joinRoom(ROOM);
		});

		p.on("connection", (conn) => {
			setupConnection(conn);
		});

		// Relay fallback: receive data from peers who connected via hybrid
		// when WebRTC couldn't be established (e.g. VPN).
		(p as any).on("relayData", (remoteId: string, payload: unknown, room?: string) => {
			if (room === ROOM) {
				if (!remotePeerConnected) {
					relayPeerId = remoteId;
					remotePeerConnected = true;
				}
				handleIncomingData(payload as FileMessage);
			}
		});

		p.on("disconnected", () => {
			connectionState = ConnectionState.Disconnected;
		});

		p.on("error", (err) => {
			error = err.message;
		});

		p.on("close", () => {
			connectionState = ConnectionState.Closed;
			peer = null;
			connection = null;
			remotePeerConnected = false;
		});
	}

	function setupConnection(conn: DataConnection) {
		conn.on("open", () => {
			connection = conn;
			remotePeerConnected = true;
		});

		conn.on("data", (data) => {
			handleIncomingData(data as FileMessage);
		});

		conn.on("close", () => {
			connection = null;
			// Only reset if we're not connected via relay or hybrid.
			if (!relayPeerId && !hybridConn?.open) {
				remotePeerConnected = false;
				resetReceiveState();
			}
		});

		conn.on("error", () => {
			// Suppress WebRTC errors — relay fallback will handle connectivity.
		});
	}

	function resetReceiveState() {
		pendingMeta = null;
		receiveChunks = [];
		receiveTransferIndex = -1;
	}

	function handleIncomingData(msg: FileMessage) {
		if (msg.type === "file-meta") {
			resetReceiveState();
			pendingMeta = msg;
			receiveChunks = new Array(msg.totalChunks);

			const transfer = createTransferRecord(msg.name, msg.size, msg.mimeType, "receive");
			transfer.status = "transferring";
			transfers = [...transfers, transfer];
			receiveTransferIndex = transfers.length - 1;
			return;
		}

		if (msg.type === "file-chunk") {
			if (pendingMeta === null || receiveTransferIndex < 0) return;

			receiveChunks[msg.index] = msg.data;

			const bytesNow = transfers[receiveTransferIndex].bytesTransferred + msg.data.byteLength;
			const partial = { ...transfers[receiveTransferIndex], bytesTransferred: bytesNow };
			partial.speed = computeSpeed(partial);
			transfers = updateTransferAt(transfers, receiveTransferIndex, partial);
			return;
		}

		if (msg.type === "file-complete") {
			if (pendingMeta === null || receiveTransferIndex < 0) return;

			const blob = new Blob(receiveChunks, { type: pendingMeta.mimeType });
			const blobUrl = URL.createObjectURL(blob);

			const final: Partial<TransferRecord> = {
				bytesTransferred: pendingMeta.size,
				status: "complete",
				blobUrl,
			};
			const merged = { ...transfers[receiveTransferIndex], ...final };
			merged.speed = computeSpeed(merged);
			transfers = updateTransferAt(transfers, receiveTransferIndex, merged);

			resetReceiveState();
		}
	}

	function connectToPeer(remotePeerId: string) {
		if (!peer) return;

		const hc = peer.connectHybrid(remotePeerId, { encryptRelay: false, iceTimeout: 5000 });
		if (!hc) return;
		hybridConn = hc;

		hc.on("open", () => {
			remotePeerConnected = true;
		});

		hc.on("data", (data) => {
			handleIncomingData(data as FileMessage);
		});

		hc.on("close", () => {
			hybridConn = null;
			remotePeerConnected = false;
			resetReceiveState();
		});

		hc.on("error", (err) => {
			error = `Connection error: ${err.message ?? String(err)}`;
		});
	}

	/** Send data via room-scoped relay so ALL peers receive it, not just
	 * the one connected via HybridConnection. This is critical for VPN
	 * clients where WebRTC fails and relay must fan out to everyone.
	 * HybridConnection (point-to-point) is tried first as optimisation;
	 * room fan-out ensures no peer is left out. */
	function sendData(data: unknown) {
		if (connection?.open) {
			// WebRTC data channel — direct P2P, fast path.
			connection.send(data);
		} else if (hybridConn?.open) {
			// Hybrid (likely relay) — send both point-to-point AND room
			// fan-out so VPN/relay-only peers don't miss the file.
			hybridConn.send(data);
			if (peer) {
				(peer as any).socket.send({
					type: "DATA",
					room: ROOM,
					payload: data,
				});
			}
		} else if (peer) {
			// Room fan-out: server relays to every peer in the room,
			// resolving the "VPN client only reaches host" issue.
			(peer as any).socket.send({
				type: "DATA",
				room: ROOM,
				payload: data,
			});
		}
	}

	async function sendFile(file: File) {
		if (!remotePeerConnected) return;

		const buffer = await file.arrayBuffer();
		const totalChunks = Math.ceil(buffer.byteLength / APP_CHUNK_SIZE);

		const transfer = createTransferRecord(
			file.name,
			file.size,
			file.type || "application/octet-stream",
			"send",
		);
		transfer.status = "transferring";
		transfers = [...transfers, transfer];
		const transferIdx = transfers.length - 1;

		// Send metadata first
		const meta: FileMeta = {
			type: "file-meta",
			name: file.name,
			size: file.size,
			mimeType: file.type || "application/octet-stream",
			totalChunks,
		};
		sendData(meta);

		// Send chunks with progress tracking
		for (let i = 0; i < totalChunks; i++) {
			const start = i * APP_CHUNK_SIZE;
			const end = Math.min(start + APP_CHUNK_SIZE, buffer.byteLength);
			const chunkData = buffer.slice(start, end);

			const chunk: FileChunk = {
				type: "file-chunk",
				index: i,
				data: chunkData,
			};

			sendData(chunk);

			const partial = { ...transfers[transferIdx], bytesTransferred: end };
			partial.speed = computeSpeed(partial);
			transfers = updateTransferAt(transfers, transferIdx, partial);

			// Yield to the event loop periodically to keep UI responsive
			if (i % 10 === 9) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		// Signal completion
		sendData({ type: "file-complete" } satisfies FileComplete);

		const final = { ...transfers[transferIdx], bytesTransferred: file.size, status: "complete" as const };
		final.speed = computeSpeed(final);
		transfers = updateTransferAt(transfers, transferIdx, final);
	}

	function disconnect() {
		hybridConn?.close();
		hybridConn = null;
		peer?.destroy();
		peer = null;
		myId = "";
		connection = null;
		relayPeerId = null;
		connectionState = ConnectionState.Closed;
		remotePeerConnected = false;
		resetReceiveState();
	}

	function clearTransfers() {
		for (const t of transfers) {
			if (t.blobUrl) {
				URL.revokeObjectURL(t.blobUrl);
			}
		}
		transfers = [];
	}

	return {
		get peer() { return peer; },
		get myId() { return myId; },
		get connection() { return connection; },
		get transfers() { return transfers; },
		get connectionState() { return connectionState; },
		get error() { return error; },
		get remotePeerConnected() { return remotePeerConnected; },
		connect,
		connectToPeer,
		sendFile,
		disconnect,
		clearTransfers,
	};
}
