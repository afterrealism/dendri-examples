<script lang="ts">
	import { createPresencePeer } from "$lib/dendri.svelte";
	import { onDestroy } from "svelte";

	function trackEvent(name: string, props?: Record<string, string>) {
		try { (window as any).rybbit?.event(name, props); } catch {}
	}

	const presence = createPresencePeer();

	let roomId = $state("dendri-presence");
	let joined = $state(false);

	function join() {
		if (!roomId.trim()) return;
		presence.connect(roomId.trim());
		trackEvent("room_joined", { room: roomId.trim() });
		joined = true;
	}

	function leave() {
		presence.disconnect();
		joined = false;
	}

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
	}

	function statusDotClass(status: "online" | "idle" | "offline"): string {
		if (status === "online") return "bg-green-500";
		if (status === "idle") return "bg-yellow-500";
		return "bg-red-500";
	}

	function statusLabel(status: "online" | "idle" | "offline"): string {
		if (status === "online") return "Online";
		if (status === "idle") return "Idle";
		return "Offline";
	}

	onDestroy(() => {
		presence.disconnect();
	});
</script>

<svelte:head>
	<title>Dendri Presence</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-border px-6 py-4">
		<div class="max-w-4xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Presence</a>
			<div class="flex items-center gap-3 text-sm">
				{#if joined}
					<span class="flex items-center gap-1.5 text-slate-600">
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						{presence.onlineCount} {presence.onlineCount === 1 ? "person" : "people"} in this room
					</span>
					{#if presence.isHost}
						<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Host</span>
					{/if}
					<button
						onclick={leave}
						class="text-xs bg-secondary hover:bg-neutral-200 text-slate-600 hover:text-slate-900 px-3 py-1 rounded-md transition-colors font-medium"
					>
						Leave
					</button>
				{/if}
			</div>
		</div>
	</header>

	{#if !joined}
		<!-- Join Room -->
		<div class="flex-1 flex items-center justify-center">
			<div class="bg-white border border-neutral-200 rounded-lg p-8 w-full max-w-sm shadow-sm">
				<h2 class="text-lg font-medium text-slate-900 mb-4">Join a room</h2>
				<form onsubmit={(e) => { e.preventDefault(); join(); }} class="flex flex-col gap-3">
					<input
						type="text"
						bind:value={roomId}
						placeholder="Room name..."
						class="border border-neutral-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 outline-none"
					/>
					<button
						type="submit"
						class="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
					>
						Join
					</button>
				</form>
				<p class="text-xs text-slate-400 mt-3">
					Open this page in multiple tabs with the same room name to see live presence.
				</p>
			</div>
		</div>
	{:else}
		<!-- Presence View -->
		<div class="flex-1 flex flex-col p-6">
			<div class="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-6">
				<!-- Room & ID info -->
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
					{#if presence.myId}
						<p class="text-xs text-slate-500 flex items-center gap-1.5">
							Your ID: <span class="font-mono text-slate-700">{presence.myId}</span>
							<button
								class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
								onclick={() => navigator.clipboard.writeText(presence.myId)}
								title="Copy your ID"
							>
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							</button>
						</p>
					{/if}
					<p class="text-xs text-slate-500 mt-1">
						Identity: <span style="color: {presence.myColor}" class="font-medium">{presence.myEmoji} {presence.myName}</span>
					</p>
				</div>

				<div class="flex flex-col lg:flex-row gap-6 flex-1">
					<!-- Presence Grid -->
					<div class="flex-1">
						<h3 class="text-sm font-medium text-slate-500 mb-3">People in this room</h3>
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
							<!-- Your own card (highlighted) -->
							<div
								class="relative bg-white ring-1 ring-black/5 rounded-lg p-4 flex flex-col items-center gap-2 ring-2 ring-blue-500/30 shadow-sm"
								style="border-left: 3px solid {presence.myColor};"
							>
								<span class="absolute top-2 right-2 text-[10px] text-blue-600 font-medium">You</span>
								<span class="text-3xl">{presence.myEmoji}</span>
								<span class="text-sm font-medium truncate max-w-full" style="color: {presence.myColor};">
									{presence.myName}
								</span>
								<span class="flex items-center gap-1 text-xs text-slate-500">
									<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
									Online
								</span>
							</div>

							<!-- Remote peer cards -->
							{#each Object.values(presence.peers) as peerInfo (peerInfo.peerId)}
								<div
									class="bg-white ring-1 ring-black/5 rounded-lg p-4 flex flex-col items-center gap-2 transition-all duration-300 shadow-sm"
									style="border-left: 3px solid {peerInfo.status === 'idle' ? 'rgba(234, 179, 8, 0.6)' : peerInfo.color}; opacity: {peerInfo.status === 'idle' ? 0.7 : 1};"
								>
									<span class="text-3xl">{peerInfo.emoji}</span>
									<span class="text-sm font-medium truncate max-w-full" style="color: {peerInfo.color};">
										{peerInfo.name}
									</span>
									<span class="flex items-center gap-1 text-xs text-slate-500">
										<span class="w-1.5 h-1.5 rounded-full {statusDotClass(peerInfo.status)}"></span>
										{statusLabel(peerInfo.status)}
									</span>
								</div>
							{/each}
						</div>

						{#if Object.keys(presence.peers).length === 0}
							<div class="mt-6 text-center">
								<p class="text-slate-500 text-sm">Waiting for others to join...</p>
								<p class="text-slate-400 text-xs mt-1">Open another tab with the same room name.</p>
							</div>
						{/if}
					</div>

					<!-- Activity Log -->
					<div class="lg:w-72 shrink-0">
						<h3 class="text-sm font-medium text-slate-500 mb-3">Activity</h3>
						<div class="bg-neutral-50 border border-neutral-200 rounded-lg p-3 max-h-[400px] overflow-y-auto">
							{#if presence.activityLog.length === 0}
								<p class="text-slate-400 text-xs text-center py-4">No activity yet.</p>
							{/if}
							{#each presence.activityLog as entry (entry.timestamp)}
								<div class="flex items-start gap-2 py-1.5 border-b border-neutral-100 last:border-0">
									<span class="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
										{formatTime(entry.timestamp)}
									</span>
									<span class="text-sm text-slate-600">{entry.message}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-t border-border px-6 py-3 text-center">
		<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-slate-600">Afterrealism</a></p>
	</footer>
</div>
