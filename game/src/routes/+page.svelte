<script lang="ts">
	import { createGamePeer } from "$lib/dendri.svelte";
	import { onDestroy, onMount } from "svelte";

	const game = createGamePeer();

	let roomId = $state("dendri-game");
	let joined = $state(false);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let animFrameId: number | undefined;
	let joystickEl: HTMLDivElement | undefined = $state();
	let isMobile = $state(false);

	function join() {
		if (!roomId.trim()) return;
		game.connect(roomId.trim());
		joined = true;
	}

	function handleKeyDown(e: KeyboardEvent) {
		const gameKeys = ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"];
		if (gameKeys.includes(e.key.toLowerCase())) {
			e.preventDefault();
			game.handleKeyDown(e.key);
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		game.handleKeyUp(e.key);
	}

	function drawGame() {
		const canvas = canvasEl;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const W = game.canvasWidth;
		const H = game.canvasHeight;

		// Scale canvas for responsive display
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Clear — light background
		ctx.fillStyle = "#fafafa";
		ctx.fillRect(0, 0, W, H);

		// Grid — subtle on light bg
		ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
		ctx.lineWidth = 1;
		for (let x = 0; x < W; x += 40) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, H);
			ctx.stroke();
		}
		for (let y = 0; y < H; y += 40) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(W, y);
			ctx.stroke();
		}

		// Dots
		for (const dot of game.dots) {
			// Glow
			ctx.beginPath();
			ctx.arc(dot.x, dot.y, game.dotRadius + 4, 0, Math.PI * 2);
			ctx.fillStyle = dot.color.replace("70%)", "70%, 0.25)").replace("hsl(", "hsla(");
			ctx.fill();

			// Dot
			ctx.beginPath();
			ctx.arc(dot.x, dot.y, game.dotRadius, 0, Math.PI * 2);
			ctx.fillStyle = dot.color;
			ctx.fill();
		}

		// Players
		const sortedPlayers = Object.entries(game.players);
		for (const [pid, player] of sortedPlayers) {
			const isMe = pid === game.myId;

			// Shadow / glow for own player
			if (isMe) {
				ctx.beginPath();
				ctx.arc(player.x, player.y, game.playerRadius + 6, 0, Math.PI * 2);
				ctx.fillStyle = player.color.replace("60%)", "60%, 0.2)").replace("hsl(", "hsla(");
				ctx.fill();
			}

			// Player circle
			ctx.beginPath();
			ctx.arc(player.x, player.y, game.playerRadius, 0, Math.PI * 2);
			ctx.fillStyle = player.color;
			ctx.fill();

			// Border — dark strokes on light canvas
			ctx.strokeStyle = isMe ? "#1e293b" : "rgba(30, 41, 59, 0.4)";
			ctx.lineWidth = isMe ? 2.5 : 1.5;
			ctx.stroke();

			// Name label — dark text on light bg
			ctx.font = "bold 11px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = "#1e293b";
			ctx.fillText(player.name, player.x, player.y - game.playerRadius - 8);

			// Score below player
			ctx.font = "10px system-ui, sans-serif";
			ctx.fillStyle = "rgba(30, 41, 59, 0.6)";
			ctx.fillText(`${player.score}`, player.x, player.y + game.playerRadius + 16);
		}

		// Instructions overlay when alone
		if (sortedPlayers.length <= 1 && game.dots.length > 0) {
			ctx.font = "14px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillStyle = "rgba(30, 41, 59, 0.3)";
			ctx.fillText("Arrow keys or WASD to move  |  Collect the dots!", W / 2, H - 20);
		}
	}

	function gameLoop() {
		game.processMovement();
		drawGame();
		animFrameId = requestAnimationFrame(gameLoop);
	}

	onMount(() => {
		isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
	});

	function handleJoystickStart(e: TouchEvent) {
		e.preventDefault();
		handleJoystickMove(e);
	}

	function handleJoystickMove(e: TouchEvent) {
		e.preventDefault();
		if (!joystickEl || !e.touches[0]) return;
		const rect = joystickEl.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const tx = e.touches[0].clientX - cx;
		const ty = e.touches[0].clientY - cy;
		const maxR = rect.width / 2;
		const dist = Math.sqrt(tx * tx + ty * ty);
		const clamp = Math.min(dist, maxR);
		const nx = clamp > 0 ? (tx / dist) * (clamp / maxR) : 0;
		const ny = clamp > 0 ? (ty / dist) * (clamp / maxR) : 0;
		game.setTouchDirection(nx, ny);
	}

	function handleJoystickEnd() {
		game.setTouchDirection(0, 0);
	}

	// Start game loop once joined
	$effect(() => {
		if (joined && canvasEl) {
			animFrameId = requestAnimationFrame(gameLoop);
			return () => {
				if (animFrameId !== undefined) {
					cancelAnimationFrame(animFrameId);
				}
			};
		}
	});

	onDestroy(() => {
		window.removeEventListener("keydown", handleKeyDown);
		window.removeEventListener("keyup", handleKeyUp);
		if (animFrameId !== undefined) {
			cancelAnimationFrame(animFrameId);
		}
		game.disconnect();
	});

	// Sort players by score for scoreboard
	let scoreboard = $derived(
		Object.entries(game.players)
			.map(([id, p]) => ({ id, name: p.name, color: p.color, score: p.score }))
			.sort((a, b) => b.score - a.score)
	);
</script>

<svelte:head>
	<title>Dendri Game</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-border px-6 py-4">
		<div class="max-w-5xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Game</a>
			<div class="flex items-center gap-3 text-sm">
				{#if joined}
					<span class="flex items-center gap-1.5 text-slate-600">
						<span class="w-2 h-2 rounded-full" style="background: {game.myColor}"></span>
						{game.myName}
					</span>
					<span class="text-slate-300">|</span>
					<span class="text-slate-600">{game.peerCount} peer{game.peerCount !== 1 ? "s" : ""}</span>
					{#if game.isHost}
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
				<h2 class="text-lg font-medium text-slate-900 mb-2">Collect the Dots</h2>
				<p class="text-sm text-slate-500 mb-4">Move with arrow keys or WASD. Collect dots to score points.</p>
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
						Play
					</button>
				</form>
				<p class="text-xs text-slate-400 mt-3">
					Open in multiple tabs with the same room name to play together.
				</p>
			</div>
		</div>
	{:else}
		<!-- Game Area -->
		<div class="flex-1 flex flex-col lg:flex-row p-4 gap-4 max-w-5xl mx-auto w-full">
			<!-- Canvas -->
			<div class="flex-1 flex flex-col gap-2">
				<div class="bg-white rounded-lg px-4 py-2 border border-neutral-200 flex items-center gap-4">
					<p class="text-xs text-slate-500 flex items-center gap-1.5">Room: <span class="font-mono text-slate-700">{roomId}</span>
						<button
							class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
							onclick={() => navigator.clipboard.writeText(roomId)}
							title="Copy room ID"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						</button>
					</p>
					{#if game.myId}
						<span class="text-neutral-300">|</span>
						<p class="text-xs text-slate-500 flex items-center gap-1.5">Your ID: <span class="font-mono text-slate-700">{game.myId}</span>
							<button
								class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
								onclick={() => navigator.clipboard.writeText(game.myId)}
								title="Copy your ID"
							>
								<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							</button>
						</p>
					{/if}
					{#if game.status === "connecting"}
						<span class="text-yellow-600 animate-pulse text-xs ml-auto">Connecting...</span>
					{/if}
				</div>
				<div class="relative bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden" style="aspect-ratio: 800 / 600; max-width: 800px;">
					<canvas
						bind:this={canvasEl}
						style="width: 100%; height: 100%; display: block;"
					></canvas>
				</div>
				<p class="text-xs text-slate-400 mt-1 hidden lg:block">Arrow keys / WASD to move. First player is host (authoritative game state).</p>

				<!-- Touch joystick for mobile -->
				{#if isMobile}
					<div class="flex justify-center mt-2">
						<div
							bind:this={joystickEl}
							ontouchstart={handleJoystickStart}
							ontouchmove={handleJoystickMove}
							ontouchend={handleJoystickEnd}
							ontouchcancel={handleJoystickEnd}
							class="w-32 h-32 rounded-full bg-neutral-100 border-2 border-neutral-300 relative touch-none select-none"
						>
							<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
								<div class="w-12 h-12 rounded-full bg-neutral-300/80 shadow-inner"></div>
							</div>
							<p class="absolute -bottom-5 w-full text-center text-[10px] text-slate-400">Drag to move</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Scoreboard -->
			<div class="w-full lg:w-56 shrink-0">
				<div class="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
					<h3 class="text-sm font-semibold mb-3 text-slate-500 uppercase tracking-wide">Scoreboard</h3>
					{#if scoreboard.length === 0}
						<p class="text-xs text-slate-400">No players yet</p>
					{:else}
						<div class="flex flex-col gap-2">
							{#each scoreboard as entry, i}
								<div class="flex items-center gap-2 {entry.id === game.myId ? 'bg-blue-50' : ''} rounded-lg px-2 py-1.5">
									<span class="text-xs text-slate-400 w-4 text-right">{i + 1}</span>
									<span class="w-3 h-3 rounded-full shrink-0" style="background: {entry.color}"></span>
									<span class="text-sm flex-1 truncate {entry.id === game.myId ? 'text-slate-900 font-medium' : 'text-slate-600'}">
										{entry.name}
										{#if entry.id === game.myId}
											<span class="text-xs text-slate-400">(you)</span>
										{/if}
									</span>
									<span class="text-sm font-mono font-bold text-slate-900">{entry.score}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-t border-border px-6 py-3 text-center">
		<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-slate-600">Afterrealism</a></p>
	</footer>
</div>
