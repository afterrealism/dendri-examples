<script lang="ts">
	import { createVideoRoom } from "$lib/dendri.svelte";
	import { goto } from "$app/navigation";
	import { onDestroy, onMount } from "svelte";

	function trackEvent(name: string, props?: Record<string, string>) {
		try { (window as any).rybbit?.event(name, props); } catch {}
	}

	const { data } = $props();
	const roomId = $derived(data.roomId);
	const vc = createVideoRoom();

	let localVideo: HTMLVideoElement | undefined = $state();
	let copied = $state(false);

	// Bind local stream to local video element
	$effect(() => {
		if (localVideo && vc.localStream) {
			localVideo.srcObject = vc.localStream;
		}
	});

	/** Svelte action: bind a remote peer's MediaStream to a <video> element */
	function bindRemoteStream(el: HTMLVideoElement, getPeerId: () => string) {
		function sync() {
			const peerId = getPeerId();
			const rp = vc.remotePeers.find((p) => p.peerId === peerId);
			if (rp?.stream && el.srcObject !== rp.stream) {
				el.srcObject = rp.stream;
			}
		}

		// Poll briefly for the stream to arrive (fires once per peer, not expensive)
		const interval = setInterval(sync, 200);
		sync();

		return {
			destroy() {
				clearInterval(interval);
			},
		};
	}

	// Join room once on mount — not in $effect to avoid re-joining on re-renders
	onMount(() => {
		vc.joinRoom(roomId);
		trackEvent("room_joined", { room: roomId });
	});

	onDestroy(() => {
		vc.leaveRoom();
	});

	function copyRoomUrl() {
		navigator.clipboard.writeText(window.location.href);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	function handleLeave() {
		vc.leaveRoom();
		trackEvent("room_left", { room: roomId });
		goto("/");
	}

</script>

<svelte:head>
	<title>Room — Dendri Video Chat</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-5xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Video Chat</a>
			<div class="flex items-center gap-3 text-sm">
				<span class="flex items-center gap-1.5 text-slate-600">
					{#if vc.connectionState === "connected"}
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						Connected
					{:else if vc.connectionState === "connecting"}
						<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
						Connecting...
					{:else if vc.connectionState === "disconnected" || vc.connectionState === "suspended"}
						<span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
						Reconnecting...
					{:else if vc.connectionState === "failed"}
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Failed
					{:else if vc.connectionState === "closed"}
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Disconnected
					{:else}
						<span class="w-2 h-2 rounded-full bg-slate-400"></span>
						{vc.connectionState}
					{/if}
				</span>
				{#if vc.peerCount > 0}
					<span class="text-slate-300">|</span>
					<span class="text-slate-600">{vc.peerCount} peer{vc.peerCount !== 1 ? "s" : ""}</span>
				{/if}
			</div>
		</div>
	</header>

	<div class="max-w-5xl mx-auto w-full flex-1 flex flex-col px-6 py-4 gap-4">
		<!-- Room Info -->
		<div class="bg-white rounded-lg px-4 py-3 border border-neutral-200">
			<div class="flex items-center justify-between gap-3">
				<p class="text-xs text-slate-500 flex items-center gap-1.5">Room: <span class="font-mono text-slate-700">{roomId}</span>
					<button
						class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
						onclick={() => navigator.clipboard.writeText(roomId)}
						title="Copy room ID"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					</button>
				</p>
				<button
					onclick={copyRoomUrl}
					class="shrink-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
				>
					{copied ? "Copied!" : "Copy Link"}
				</button>
			</div>
			{#if vc.myId}
				<p class="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
					Your ID: <span class="font-mono text-slate-700">{vc.myId}</span>
					<button
						class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
						onclick={() => navigator.clipboard.writeText(vc.myId)}
						title="Copy your ID"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					</button>
				</p>
			{/if}
		</div>

		<!-- Error -->
		{#if vc.error}
			<div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
				{vc.error}
			</div>
		{/if}

		<!-- Video Area -->
		<div class="flex-1 min-h-[400px] relative">
			{#if vc.peerCount > 0}
				<!-- Remote videos in a responsive grid -->
				<div class="w-full h-full grid gap-2 {vc.peerCount === 1 ? 'grid-cols-1' : vc.peerCount <= 4 ? 'grid-cols-2' : 'grid-cols-3'}">
					{#each vc.remotePeers as rp (rp.peerId)}
						<div class="bg-neutral-100 border border-neutral-200 rounded-lg overflow-hidden relative">
							{#if rp.stream}
								<video
									use:bindRemoteStream={() => rp.peerId}
									autoplay
									playsinline
									class="w-full h-full object-cover"
								></video>
							{:else}
								<div class="w-full h-full flex items-center justify-center">
									<p class="text-slate-400 text-sm">Connecting...</p>
								</div>
							{/if}
							<span class="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
								{rp.peerId.slice(0, 8)}
							</span>
						</div>
					{/each}
				</div>

				<!-- Local video (picture-in-picture) -->
				{#if vc.localStream}
					<div class="absolute bottom-4 right-4 w-36 md:w-44 aspect-video bg-neutral-100 rounded-lg overflow-hidden border-2 border-neutral-300 shadow-lg">
						{#if vc.videoEnabled}
							<video
								bind:this={localVideo}
								autoplay
								playsinline
								muted
								class="w-full h-full object-cover -scale-x-100"
							></video>
						{:else}
							<div class="w-full h-full flex items-center justify-center bg-neutral-200">
								<span class="text-slate-400 text-xs">No camera</span>
							</div>
						{/if}
						<span class="absolute bottom-1 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">You</span>
					</div>
				{/if}
			{:else}
				<!-- Waiting for peers: show local video centered -->
				<div class="w-full h-full flex flex-col items-center justify-center gap-4">
					<div class="w-full max-w-md aspect-video bg-neutral-100 border border-neutral-200 rounded-lg overflow-hidden">
						{#if vc.localStream && vc.videoEnabled}
							<video
								bind:this={localVideo}
								autoplay
								playsinline
								muted
								class="w-full h-full object-cover -scale-x-100"
							></video>
						{:else if vc.localStream}
							<div class="w-full h-full flex items-center justify-center bg-neutral-200">
								<div class="text-slate-500 text-sm text-center p-4">
									<p>No camera detected</p>
									<p class="text-xs mt-1 text-slate-400">You can still see others' video</p>
								</div>
							</div>
						{:else}
							<div class="w-full h-full flex items-center justify-center">
								<div class="text-slate-500 text-sm text-center p-4">
									<p>Local camera</p>
									<p class="text-xs mt-1 text-slate-400">Requesting camera access...</p>
								</div>
							</div>
						{/if}
					</div>
					<p class="text-slate-400 text-sm">Waiting for others to join...</p>
					<button
						onclick={copyRoomUrl}
						class="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
					>
						{copied ? "Link Copied!" : "Share Room Link"}
					</button>
				</div>
			{/if}
		</div>

		<!-- Controls -->
		<div class="flex items-center justify-center gap-3 py-2">
			<!-- Toggle Audio -->
			<button
				onclick={() => vc.toggleAudio()}
				class="w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer {vc.audioEnabled ? 'bg-neutral-100 hover:bg-neutral-200 text-slate-700' : 'bg-red-100 text-red-600 hover:bg-red-200'}"
				title={vc.audioEnabled ? "Mute" : "Unmute"}
			>
				{#if vc.audioEnabled}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
						<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
						<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
						<line x1="12" x2="12" y1="19" y2="22" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
						<line x1="2" x2="22" y1="2" y2="22" />
						<path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
						<path d="M5 10v2a7 7 0 0 0 12 0" />
						<path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
						<path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
						<line x1="12" x2="12" y1="19" y2="22" />
					</svg>
				{/if}
			</button>

			<!-- Toggle Video -->
			<button
				onclick={() => vc.toggleVideo()}
				class="w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer {vc.videoEnabled ? 'bg-neutral-100 hover:bg-neutral-200 text-slate-700' : 'bg-red-100 text-red-600 hover:bg-red-200'}"
				title={vc.videoEnabled ? "Turn off camera" : "Turn on camera"}
			>
				{#if vc.videoEnabled}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
						<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
						<rect x="2" y="6" width="14" height="12" rx="2" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
						<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
						<path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
						<line x1="2" x2="22" y1="2" y2="22" />
					</svg>
				{/if}
			</button>

			<!-- Leave Room -->
			<button
				onclick={() => { handleLeave(); trackEvent("call_ended"); }}
				class="w-14 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
				title="Leave room"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
					<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4Z" />
					<line x1="22" x2="2" y1="2" y2="22" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Footer -->
	<footer class="border-t border-neutral-200 px-6 py-4">
		<div class="max-w-5xl mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 transition-colors underline underline-offset-2">Afterrealism</a></p>
		</div>
	</footer>
</div>
