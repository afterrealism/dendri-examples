import { createDendriStore } from "@afterrealism/dendri-client";
import { useEffect, useRef, useState } from "react";

// Point at any deployed server via VITE_DENDRI_URL; falls back to the local dev stack.
const serverUrl = new URL(import.meta.env.VITE_DENDRI_URL ?? "http://127.0.0.1:9876");

const DENDRI_OPTIONS = {
	host: serverUrl.hostname,
	port: Number(serverUrl.port) || (serverUrl.protocol === "https:" ? 443 : 80),
	secure: serverUrl.protocol === "https:",
	apiKey: import.meta.env.VITE_DENDRI_API_KEY,
	path: serverUrl.pathname,
	debug: 0,
	fetchTurnCredentials: true,
	enableRelay: true,
};

export default function App() {
	const storeRef = useRef(null);
	if (storeRef.current === null) {
		storeRef.current = createDendriStore(DENDRI_OPTIONS);
	}
	const store = storeRef.current;
	const [roomName, setRoomName] = useState("react-demo-room");
	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState([]);
	const [snapshot, setSnapshot] = useState(() => store.getSnapshot());

	useEffect(() => {
		const unsubscribeStore = store.subscribe(() => {
			setSnapshot(store.getSnapshot());
		});

		const unsubscribeTopic = store.subscribe("chat", (data) => {
			if (!data || typeof data !== "object" || data.type !== "chat") {
				return;
			}

			setMessages((prev) => [...prev, data]);
		});

		return () => {
			unsubscribeStore();
			unsubscribeTopic();
			store.destroy();
		};
	}, [store]);

	function joinRoom() {
		const trimmed = roomName.trim();
		if (!trimmed) return;
		store.join(trimmed);
	}

	function sendMessage() {
		const trimmed = message.trim();
		if (!trimmed) return;

		const payload = {
			type: "chat",
			from: snapshot.myPeerId ?? "me",
			text: trimmed,
		};

		store.broadcast(payload, { topic: "chat" });
		setMessages((prev) => [...prev, payload]);
		setMessage("");
	}

	return (
		<>
			<style>{`
				.app-container {
					max-width: 720px;
					margin: 0 auto;
					padding: 1.5rem;
					font-family: Inter, system-ui, sans-serif;
					width: 100%;
					box-sizing: border-box;
				}
				.app-row {
					display: flex;
					gap: 0.5rem;
					margin-bottom: 0.75rem;
				}
				.app-row input {
					flex: 1;
					padding: 0.5rem;
				}
				.app-status {
					font-size: 1rem;
				}

				@media (max-width: 639px) {
					.app-container {
						padding: 1rem;
					}
					.app-row {
						flex-direction: column;
					}
					.app-row input,
					.app-row button {
						width: 100%;
					}
					.app-status {
						font-size: 0.875rem;
					}
				}
			`}</style>
			<main className="app-container">
				<h1>Dendri React Chat</h1>
				<p className="app-status">
					Signal status: {snapshot.connectionState === "connected" ? "Connected" : "Connecting..."}
				</p>
				<p>
					Role: {snapshot.isHost ? "Host" : "Client"} | {snapshot.peerCount} peer
					{snapshot.peerCount === 1 ? "" : "s"}
				</p>

				<section className="app-row">
					<input
						placeholder="Room name..."
						value={roomName}
						onChange={(event) => setRoomName(event.target.value)}
					/>
					<button type="button" onClick={joinRoom}>
						Join
					</button>
				</section>

				<section className="app-row">
					<input
						placeholder="Type a message..."
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") sendMessage();
						}}
					/>
					<button type="button" onClick={sendMessage} disabled={snapshot.peerCount === 0}>
						Send
					</button>
				</section>

			<ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
				{messages.map((entry, index) => (
					<li key={`${entry.from}-${index}`} style={{ padding: "0.25rem 0" }}>
						<strong>{entry.from}:</strong> {entry.text}
					</li>
				))}
			</ul>
			</main>
		</>
	);
}
