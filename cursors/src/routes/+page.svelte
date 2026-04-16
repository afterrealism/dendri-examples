<script lang="ts">
	import { createCursorPeer } from "$lib/dendri.svelte";
	import { onDestroy, onMount } from "svelte";

	const peer = createCursorPeer();

	let roomId = $state("dendri-cursors");
	let joined = $state(false);
	let canvas: HTMLDivElement | undefined = $state();

	function join() {
		if (!roomId.trim()) return;
		peer.connect(roomId.trim());
		joined = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;
		peer.broadcastCursor(x, y);
	}

	function handleMouseLeave() {
		peer.broadcastCursorLeave();
	}

	// Clean up stale cursors every 3s
	let cleanupInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		cleanupInterval = setInterval(() => {
			// Cursors older than 5s are stale — handled by the peer manager on disconnect
		}, 3000);
	});

	onDestroy(() => {
		clearInterval(cleanupInterval);
		peer.disconnect();
	});
</script>

<svelte:head>
	<title>Dendri Cursors</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-4xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Cursors</a>
			<div class="flex items-center gap-3 text-sm text-slate-600">
				{#if joined}
					<span class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full" style="background: {peer.myColor}"></span>
						{peer.myName}
					</span>
					<span class="text-slate-400">·</span>
					<span>{peer.peerCount} peer{peer.peerCount !== 1 ? "s" : ""}</span>
					{#if peer.isHost}
						<span class="text-xs bg-slate-100 text-slate-700 ring-1 ring-black/5 px-2 py-0.5 rounded-full">Host</span>
					{/if}
				{/if}
			</div>
		</div>
	</header>

	{#if !joined}
		<!-- Join Room -->
		<div class="flex-1 flex items-center justify-center">
			<div class="bg-white border border-neutral-200 rounded-lg p-8 w-full max-w-sm">
				<h2 class="text-lg font-medium text-slate-900 mb-4">Join a room</h2>
				<form onsubmit={(e) => { e.preventDefault(); join(); }} class="flex flex-col gap-3">
					<input
						type="text"
						bind:value={roomId}
						placeholder="Room name..."
						class="border border-neutral-300 rounded-md px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
					/>
					<button
						type="submit"
						class="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 rounded-md text-sm font-medium transition-colors"
					>
						Join
					</button>
				</form>
				<p class="text-xs text-slate-400 mt-3">
					Open this page in multiple tabs with the same room name to see cursors sync.
				</p>
			</div>
		</div>
	{:else}
		<!-- Canvas -->
		<div class="flex-1 flex flex-col p-6">
			<div class="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-4">
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
					{#if peer.myId}
						<p class="text-xs text-slate-500 flex items-center gap-1.5">
							Your ID: <span class="font-mono text-slate-700">{peer.myId}</span>
							<button
								class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
								onclick={() => navigator.clipboard.writeText(peer.myId)}
								title="Copy your ID"
							>
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							</button>
						</p>
					{/if}
				</div>

				<p class="text-sm text-slate-500">
					Move your mouse over the canvas. Other peers will see your cursor.
				</p>

				<div
					bind:this={canvas}
					onmousemove={handleMouseMove}
					onmouseleave={handleMouseLeave}
					class="relative flex-1 min-h-[60vh] sm:min-h-[500px] bg-white border border-neutral-200 rounded-lg overflow-hidden cursor-none"
				>
					<!-- Grid pattern -->
					<div class="absolute inset-0 opacity-[0.06]" style="background-image: radial-gradient(circle, #94a3b8 1px, transparent 1px); background-size: 40px 40px;"></div>

					<!-- All cursors (own + remote) -->
					{#each Object.entries(peer.cursors) as [id, cursor]}
						<div
							class="absolute pointer-events-none transition-all duration-75 ease-out"
							style="left: {cursor.x}%; top: {cursor.y}%; transform: translate(-50%, -50%);{id === peer.myId ? ' opacity: 0.6;' : ''}"
						>
							<!-- Cursor arrow SVG -->
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
								<path
									d="M5 3L19 12L12 13L9 20L5 3Z"
									fill={cursor.color}
									stroke="white"
									stroke-width="1"
								/>
							</svg>
							<!-- Name label -->
							<div
								class="absolute left-5 top-4 text-xs font-medium px-1.5 py-0.5 rounded truncate max-w-[120px]"
								style="background: {cursor.color}; color: white;"
							>
								{id === peer.myId ? `${cursor.name} (You)` : cursor.name}
							</div>
						</div>
					{/each}

					<!-- Center label -->
					{#if Object.keys(peer.cursors).length <= 1}
						<div class="absolute inset-0 flex items-center justify-center">
							<p class="text-slate-400 text-sm">Move your mouse here. Open another tab to see cursors sync.</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-t border-neutral-200 px-6 py-3">
		<div class="max-w-4xl mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 underline" target="_blank" rel="noopener noreferrer">Afterrealism</a></p>
		</div>
	</footer>
</div>
