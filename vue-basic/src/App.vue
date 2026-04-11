<script setup>
import { createDendriStore } from "@afterrealism/dendri-client";
import { onUnmounted, ref } from "vue";

// Point at any deployed server via VITE_DENDRI_URL; falls back to the local dev stack.
const serverUrl = new URL(import.meta.env.VITE_DENDRI_URL ?? "http://127.0.0.1:9876");

const store = createDendriStore({
	host: serverUrl.hostname,
	port: Number(serverUrl.port) || (serverUrl.protocol === "https:" ? 443 : 80),
	secure: serverUrl.protocol === "https:",
	apiKey: import.meta.env.VITE_DENDRI_API_KEY,
	path: serverUrl.pathname,
	debug: 0,
	fetchTurnCredentials: false,
});

const roomName = ref("vue-demo-room");
const message = ref("");
const messages = ref([]);
const snapshot = ref(store.getSnapshot());

const unsubscribeStore = store.subscribe(() => {
	snapshot.value = store.getSnapshot();
});

const unsubscribeData = store.subscribe("chat", (data) => {
	if (!data || typeof data !== "object" || data.type !== "chat") {
		return;
	}
	messages.value.push(data);
});

function joinRoom() {
	const trimmed = roomName.value.trim();
	if (!trimmed) return;
	store.join(trimmed);
}

function sendMessage() {
	const trimmed = message.value.trim();
	if (!trimmed) return;

	const payload = {
		type: "chat",
		from: snapshot.value.myPeerId ?? "me",
		text: trimmed,
	};

	store.broadcast(payload, { topic: "chat" });
	messages.value.push(payload);
	message.value = "";
}

onUnmounted(() => {
	unsubscribeData();
	unsubscribeStore();
	store.destroy();
});
</script>

<template>
	<main class="container">
		<h1>Dendri Vue Chat</h1>
		<p>Signal status: {{ snapshot.connectionState === "connected" ? "Connected" : "Connecting..." }}</p>
		<p>
			Role: {{ snapshot.isHost ? "Host" : "Client" }} | {{ snapshot.peerCount }} peer{{
				snapshot.peerCount === 1 ? "" : "s"
			}}
		</p>

		<section class="row">
			<input v-model="roomName" placeholder="Room name..." />
			<button type="button" @click="joinRoom">Join</button>
		</section>

		<section class="row">
			<input
				v-model="message"
				placeholder="Type a message..."
				@keydown.enter="sendMessage"
			/>
			<button type="button" :disabled="snapshot.peerCount === 0" @click="sendMessage">Send</button>
		</section>

		<ul class="messages">
			<li v-for="(entry, index) in messages" :key="`${entry.from}-${index}`">
				<strong>{{ entry.from }}:</strong> {{ entry.text }}
			</li>
		</ul>
	</main>
</template>

<style scoped>
.container {
	max-width: 720px;
	margin: 0 auto;
	padding: 1.5rem;
	font-family: Inter, system-ui, sans-serif;
	width: 100%;
	box-sizing: border-box;
}

.row {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 0.75rem;
}

input {
	flex: 1;
	padding: 0.5rem;
}

.messages {
	list-style: none;
	padding: 0;
	margin: 0;
}

@media (max-width: 639px) {
	.container {
		padding: 1rem;
	}

	.row {
		flex-direction: column;
	}

	.row input,
	.row button {
		width: 100%;
	}
}
</style>
