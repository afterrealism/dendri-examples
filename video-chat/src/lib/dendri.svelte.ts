import Dendri, { ConnectionState } from "@afterrealism/dendri-client";
import type { MediaConnection } from "@afterrealism/dendri-client";
import { env } from "$env/dynamic/public";

interface RemotePeer {
	readonly peerId: string;
	readonly stream: MediaStream | null;
	readonly call: MediaConnection;
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

export function createVideoRoom() {
	let peer = $state<Dendri | null>(null);
	let myId = $state("");
	let currentRoomId = $state("");
	let connectionState = $state<ConnectionState>(ConnectionState.Initialized);
	let error = $state<string | null>(null);
	let localStream = $state<MediaStream | null>(null);
	let remotePeers = $state<RemotePeer[]>([]);
	let audioEnabled = $state(true);
	let videoEnabled = $state(true);

	/** Track peer IDs we're currently connecting to (prevents race-condition duplicates) */
	const connectingPeers = new Set<string>();

	function joinRoom(roomId: string) {
		// Guard: prevent duplicate joins
		if (peer) return;

		currentRoomId = roomId;
		connectionState = ConnectionState.Connecting;
		error = null;

		// Request camera/mic immediately so the preview appears while connecting.
		// If devices are unavailable, getLocalStream() creates an empty stream
		// so the user can still join and see others.
		getLocalStream();

		const p = new Dendri(resolveDendriOptions());

		p.on("open", (id) => {
			myId = id;
			connectionState = ConnectionState.Connected;
			peer = p;

			// Register in the server-side room to discover existing peers
			p.joinRoom(roomId);
		});

		// Server sends back the list of peers already in the room — call each one
		p.on("roomPeers", (_room, peerIds) => {
			for (const id of peerIds) {
				if (id !== myId && !remotePeers.some((rp) => rp.peerId === id)) {
					callPeer(id);
				}
			}
		});

		// Auto-answer incoming calls from peers who join after us
		p.on("call", (incomingCall) => {
			handleIncomingCall(incomingCall);
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
		});
	}

	async function getLocalStream(): Promise<MediaStream> {
		if (localStream) return localStream;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true,
			});
			localStream = stream;
			audioEnabled = true;
			videoEnabled = true;
			return stream;
		} catch {
			// Camera/mic unavailable — create a dummy stream with black video
			// and silent audio so WebRTC SDP negotiation includes media lines.
			// Without tracks, the remote peer can't send video back.
			const stream = createDummyStream();
			localStream = stream;
			audioEnabled = false;
			videoEnabled = false;
			return stream;
		}
	}

	/** Create a black-video + silent-audio MediaStream for receive-only mode. */
	function createDummyStream(): MediaStream {
		const stream = new MediaStream();

		// Black video track via canvas
		const canvas = document.createElement("canvas");
		canvas.width = 640;
		canvas.height = 480;
		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.fillStyle = "black";
			ctx.fillRect(0, 0, 640, 480);
		}
		const videoTrack = canvas.captureStream(1).getVideoTracks()[0];
		if (videoTrack) {
			videoTrack.enabled = false;
			stream.addTrack(videoTrack);
		}

		// Silent audio track via AudioContext
		try {
			const audioCtx = new AudioContext();
			const oscillator = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			gain.gain.value = 0; // silent
			oscillator.connect(gain);
			const dest = audioCtx.createMediaStreamDestination();
			gain.connect(dest);
			oscillator.start();
			const audioTrack = dest.stream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = false;
				stream.addTrack(audioTrack);
			}
		} catch {
			// AudioContext not available — proceed with video-only
		}

		return stream;
	}

	async function callPeer(remotePeerId: string) {
		if (!peer) return;
		// Guard: already connected or connecting
		if (remotePeers.some((rp) => rp.peerId === remotePeerId)) return;
		if (connectingPeers.has(remotePeerId)) return;

		connectingPeers.add(remotePeerId);
		try {
			const stream = await getLocalStream();
			// Re-check after async gap — incoming call may have been handled
			if (remotePeers.some((rp) => rp.peerId === remotePeerId)) return;
			const mediaConnection = peer.call(remotePeerId, stream);
			if (mediaConnection) {
				setupCall(remotePeerId, mediaConnection);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to start call";
		} finally {
			connectingPeers.delete(remotePeerId);
		}
	}

	function handleIncomingCall(incomingCall: MediaConnection) {
		const remotePeerId = incomingCall.peer;

		// Avoid duplicate connections — check both connected and in-progress
		if (remotePeers.some((rp) => rp.peerId === remotePeerId)) return;
		if (connectingPeers.has(remotePeerId)) return;

		connectingPeers.add(remotePeerId);
		getLocalStream()
			.then((stream) => {
				// Re-check after async gap
				if (remotePeers.some((rp) => rp.peerId === remotePeerId)) return;
				incomingCall.answer(stream);
				setupCall(remotePeerId, incomingCall);
			})
			.catch((err) => {
				error =
					err instanceof Error
						? err.message
						: "Failed to access media devices";
			})
			.finally(() => {
				connectingPeers.delete(remotePeerId);
			});
	}

	function setupCall(remotePeerId: string, mediaConnection: MediaConnection) {
		// Guard against duplicate setup
		if (remotePeers.some((rp) => rp.peerId === remotePeerId)) return;

		remotePeers = [
			...remotePeers,
			{ peerId: remotePeerId, stream: null, call: mediaConnection },
		];

		// If video/audio is currently toggled off, null out the sender tracks
		// so the new peer doesn't receive a stream we've already muted.
		const applyCurrentToggles = () => {
			const pc = mediaConnection.peerConnection;
			if (!pc) return;
			for (const sender of pc.getSenders()) {
				if (sender.track?.kind === "video" && !videoEnabled) {
					sender.replaceTrack(null).catch(() => {});
				}
				if (sender.track?.kind === "audio" && !audioEnabled) {
					sender.replaceTrack(null).catch(() => {});
				}
			}
		};
		// Senders are available once the connection is negotiated
		setTimeout(applyCurrentToggles, 500);

		let streamReceived = false;

		mediaConnection.on("stream", (stream) => {
			streamReceived = true;
			remotePeers = remotePeers.map((rp) =>
				rp.peerId === remotePeerId ? { ...rp, stream } : rp,
			);
		});

		mediaConnection.on("close", () => {
			remotePeers = remotePeers.filter((rp) => rp.peerId !== remotePeerId);
		});

		mediaConnection.on("error", () => {
			// Remove failed peer from the list so it doesn't show "Connecting..." forever.
			remotePeers = remotePeers.filter((rp) => rp.peerId !== remotePeerId);
		});

		// Timeout: if no stream arrives within 15s, remove the stuck peer entry.
		// Media connections can't fall back to signaling relay — TURN is required.
		setTimeout(() => {
			if (!streamReceived) {
				remotePeers = remotePeers.filter((rp) => rp.peerId !== remotePeerId);
			}
		}, 15_000);
	}

	function toggleAudio() {
		if (!localStream) return;
		const audioTrack = localStream.getAudioTracks()[0];
		if (!audioTrack) return;

		const newEnabled = !audioTrack.enabled;
		audioTrack.enabled = newEnabled;
		audioEnabled = newEnabled;

		// On mobile, also swap the sender track for reliable mute
		for (const rp of remotePeers) {
			const pc = rp.call.peerConnection;
			if (!pc) continue;
			for (const sender of pc.getSenders()) {
				if (sender.track?.kind === "audio" || (!sender.track && !newEnabled)) {
					sender.replaceTrack(newEnabled ? audioTrack : null).catch(() => {});
				}
			}
		}
	}

	function toggleVideo() {
		if (!localStream) return;
		const videoTrack = localStream.getVideoTracks()[0];
		if (!videoTrack) return;

		const newEnabled = !videoTrack.enabled;
		videoTrack.enabled = newEnabled;
		videoEnabled = newEnabled;

		// On mobile, track.enabled alone is unreliable — use replaceTrack
		// to swap the video sender to null (off) or back to the track (on).
		for (const rp of remotePeers) {
			const pc = rp.call.peerConnection;
			if (!pc) continue;
			for (const sender of pc.getSenders()) {
				if (sender.track?.kind === "video" || (!sender.track && !newEnabled)) {
					sender.replaceTrack(newEnabled ? videoTrack : null).catch(() => {});
				}
			}
		}
	}

	function leaveRoom() {
		connectingPeers.clear();
		for (const rp of remotePeers) {
			rp.call.close();
		}
		remotePeers = [];

		if (localStream) {
			for (const track of localStream.getTracks()) {
				track.stop();
			}
			localStream = null;
		}

		if (peer) {
			if (currentRoomId) {
				peer.leaveRoom(currentRoomId);
			}
			peer.destroy();
			peer = null;
		}

		myId = "";
		currentRoomId = "";
		connectionState = ConnectionState.Closed;
	}

	return {
		get myId() {
			return myId;
		},
		get roomId() {
			return currentRoomId;
		},
		get connectionState() {
			return connectionState;
		},
		get error() {
			return error;
		},
		get localStream() {
			return localStream;
		},
		get remotePeers() {
			return remotePeers;
		},
		get audioEnabled() {
			return audioEnabled;
		},
		get videoEnabled() {
			return videoEnabled;
		},
		get peerCount() {
			return remotePeers.length;
		},
		joinRoom,
		toggleAudio,
		toggleVideo,
		leaveRoom,
	};
}
