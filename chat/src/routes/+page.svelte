<script lang="ts">
	import { createPeer } from "$lib/dendri.svelte";
	import { onDestroy } from "svelte";

	function trackEvent(name: string, props?: Record<string, string>) {
		try { (window as any).rybbit?.event(name, props); } catch {}
	}

	const chat = createPeer();

	let roomId = $state("dendri-chat");
	let messageInput = $state("");
	let messagesDiv: HTMLDivElement | undefined = $state();
	let joined = $state(false);

	// Auto-scroll to bottom on new messages
	$effect(() => {
		if (chat.messages.length && messagesDiv) {
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}
	});

	onDestroy(() => {
		chat.disconnect();
	});

	function handleJoin() {
		if (!roomId.trim()) return;
		chat.connect(roomId.trim());
		trackEvent("room_joined", { room: roomId.trim() });
		joined = true;
	}

	function handleSend() {
		if (messageInput.trim()) {
			chat.sendMessage(messageInput.trim());
			trackEvent("message_sent");
			messageInput = "";
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	function connectionStateColor(state: string): string {
		switch (state) {
			case "connected": return "bg-green-500";
			case "connecting": return "bg-yellow-500 animate-pulse";
			case "disconnected":
			case "suspended": return "bg-orange-500";
			case "failed": return "bg-red-500";
			case "closed": return "bg-slate-400";
			default: return "bg-slate-300";
		}
	}

	function connectionStateLabel(state: string): string {
		switch (state) {
			case "initialized": return "Ready";
			case "connecting": return "Connecting...";
			case "connected": return "Connected";
			case "disconnected": return "Disconnected";
			case "suspended": return "Suspended";
			case "closed": return "Closed";
			case "failed": return "Failed";
			default: return state;
		}
	}
</script>

<svelte:head>
	<title>Dendri Chat</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-2xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Chat</a>
			<div class="flex items-center gap-3 text-sm text-slate-600">
				{#if joined}
					<span class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full {connectionStateColor(chat.connectionState)}"></span>
						{connectionStateLabel(chat.connectionState)}
					</span>
					<span class="text-slate-300">|</span>
					<span>{chat.peerCount} peer{chat.peerCount !== 1 ? "s" : ""}</span>
					{#if chat.isHost}
						<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Host</span>
					{/if}
				{/if}
			</div>
		</div>
	</header>

	{#if !joined}
		<!-- Join Room -->
		<div class="flex-1 flex items-center justify-center">
			<div class="bg-white border border-neutral-200 rounded-lg p-8 w-full max-w-sm shadow-sm">
				<h2 class="text-lg font-medium text-slate-900 mb-4">Join a chat room</h2>
				<form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="flex flex-col gap-3">
					<input
						type="text"
						bind:value={roomId}
						placeholder="Room name..."
						class="border border-neutral-300 rounded-md px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
					/>
					<button
						type="submit"
						class="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
					>
						Join
					</button>
				</form>
				<p class="text-xs text-slate-400 mt-3">
					Open this page in multiple tabs with the same room name to chat.
				</p>
			</div>
		</div>
	{:else}
		<div class="max-w-2xl mx-auto w-full flex-1 flex flex-col p-6 gap-4">
			<!-- Room info -->
			<div class="bg-white rounded-lg px-4 py-3 border border-neutral-200">
				<p class="text-xs text-slate-500 mb-1 flex items-center gap-1.5">Room: <span class="font-mono text-slate-700">{roomId}</span>
						<button
							class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
							onclick={() => navigator.clipboard.writeText(roomId)}
							title="Copy room ID"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						</button>
					</p>
				{#if chat.myId}
					<p class="text-xs text-slate-500 flex items-center gap-1.5">
						Your ID: <span class="font-mono text-slate-700">{chat.myId}</span>
						<button
							class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
							onclick={() => navigator.clipboard.writeText(chat.myId)}
							title="Copy your ID"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						</button>
					</p>
				{/if}
			</div>

			<!-- Error -->
			{#if chat.error}
				<div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
					{chat.error}
				</div>
			{/if}

			<!-- Messages -->
			<div
				bind:this={messagesDiv}
				class="flex-1 min-h-[300px] bg-white border border-neutral-200 rounded-lg p-4 overflow-y-auto flex flex-col gap-2"
			>
				{#if chat.messages.length === 0}
					<p class="text-slate-400 text-sm text-center my-auto">
						No messages yet. Waiting for peers to join room...
					</p>
				{/if}
				{#each chat.messages as msg}
					<div
						class="flex flex-col {msg.sender === chat.myId ? 'items-end' : 'items-start'}"
					>
						<div
							class="max-w-[80%] rounded-lg px-3 py-2 text-sm {msg.sender === chat.myId
								? 'bg-primary text-primary-foreground'
								: 'bg-secondary text-secondary-foreground'}"
						>
							{msg.text}
						</div>
						<span class="text-[10px] text-slate-400 mt-0.5 px-1">
							{msg.sender === chat.myId ? "You" : msg.sender.slice(0, 8)} · {formatTime(msg.timestamp)}
						</span>
					</div>
				{/each}
			</div>

			<!-- Input -->
			<form onsubmit={(e) => { e.preventDefault(); handleSend(); }} class="flex gap-2">
				<input
					type="text"
					bind:value={messageInput}
					onkeydown={handleKeydown}
					placeholder={chat.peerCount > 0 ? "Type a message..." : "Waiting for peers..."}
					disabled={chat.peerCount === 0}
					class="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-40"
				/>
				<button
					type="submit"
					disabled={!messageInput.trim() || chat.peerCount === 0}
					class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-md text-sm font-medium transition-colors"
				>
					Send
				</button>
			</form>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-t border-neutral-200 px-6 py-3">
		<div class="max-w-2xl mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 underline" target="_blank" rel="noopener noreferrer">Afterrealism</a></p>
		</div>
	</footer>
</div>
