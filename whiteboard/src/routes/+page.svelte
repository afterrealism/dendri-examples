<script lang="ts">
	import { createWhiteboardPeer } from "$lib/dendri.svelte";
	import type { StrokePoint, Stroke } from "$lib/dendri.svelte";
	import { onDestroy, onMount } from "svelte";

	const wb = createWhiteboardPeer();

	let roomId = $state("dendri-whiteboard");
	let joined = $state(false);

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;

	let isDrawing = $state(false);
	let currentPoints: StrokePoint[] = [];

	const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#334155"];
	let selectedColor = $state(COLORS[4]);
	let brushSize = $state(4);

	let lastStrokeCount = 0;

	function join() {
		if (!roomId.trim()) return;
		wb.connect(roomId.trim());
		joined = true;
	}

	function initCanvas() {
		if (!canvasEl) return;
		ctx = canvasEl.getContext("2d");
		resizeCanvas();
	}

	function resizeCanvas() {
		if (!canvasEl || !ctx) return;
		const rect = canvasEl.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = rect.width * dpr;
		canvasEl.height = rect.height * dpr;
		ctx.scale(dpr, dpr);
		redrawAll();
	}

	function toNormalized(clientX: number, clientY: number): StrokePoint {
		if (!canvasEl) return { x: 0, y: 0 };
		const rect = canvasEl.getBoundingClientRect();
		return {
			x: ((clientX - rect.left) / rect.width) * 100,
			y: ((clientY - rect.top) / rect.height) * 100,
		};
	}

	function toCanvas(point: StrokePoint): { x: number; y: number } {
		if (!canvasEl) return { x: 0, y: 0 };
		const rect = canvasEl.getBoundingClientRect();
		return {
			x: (point.x / 100) * rect.width,
			y: (point.y / 100) * rect.height,
		};
	}

	function drawStroke(stroke: Stroke) {
		if (!ctx || stroke.points.length < 2) return;
		ctx.strokeStyle = stroke.color;
		ctx.lineWidth = stroke.size;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		const first = toCanvas(stroke.points[0]);
		ctx.moveTo(first.x, first.y);
		for (let i = 1; i < stroke.points.length; i++) {
			const p = toCanvas(stroke.points[i]);
			ctx.lineTo(p.x, p.y);
		}
		ctx.stroke();
	}

	function drawCurrentStroke() {
		if (!ctx || currentPoints.length < 2) return;
		ctx.strokeStyle = selectedColor;
		ctx.lineWidth = brushSize;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		const first = toCanvas(currentPoints[0]);
		ctx.moveTo(first.x, first.y);
		for (let i = 1; i < currentPoints.length; i++) {
			const p = toCanvas(currentPoints[i]);
			ctx.lineTo(p.x, p.y);
		}
		ctx.stroke();
	}

	function redrawAll() {
		if (!ctx || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		ctx.clearRect(0, 0, rect.width, rect.height);
		for (const stroke of wb.strokes) {
			drawStroke(stroke);
		}
		if (isDrawing) {
			drawCurrentStroke();
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (!canvasEl) return;
		isDrawing = true;
		currentPoints = [toNormalized(e.clientX, e.clientY)];
		canvasEl.setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDrawing || !ctx) return;
		const point = toNormalized(e.clientX, e.clientY);
		currentPoints = [...currentPoints, point];

		// Draw incremental segment for smooth local feedback
		if (currentPoints.length >= 2) {
			const prev = toCanvas(currentPoints[currentPoints.length - 2]);
			const curr = toCanvas(point);
			ctx.strokeStyle = selectedColor;
			ctx.lineWidth = brushSize;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.beginPath();
			ctx.moveTo(prev.x, prev.y);
			ctx.lineTo(curr.x, curr.y);
			ctx.stroke();
		}
	}

	function handlePointerUp(_e: PointerEvent) {
		if (!isDrawing) return;
		isDrawing = false;
		if (currentPoints.length >= 2) {
			wb.broadcastStroke(currentPoints, selectedColor, brushSize);
		}
		currentPoints = [];
	}

	function handleClear() {
		wb.broadcastClear();
		if (ctx && canvasEl) {
			const rect = canvasEl.getBoundingClientRect();
			ctx.clearRect(0, 0, rect.width, rect.height);
		}
	}

	// Redraw when strokes change from remote peers
	$effect(() => {
		const count = wb.strokes.length;
		if (count !== lastStrokeCount) {
			lastStrokeCount = count;
			redrawAll();
		}
	});

	onMount(() => {
		const handleResize = () => resizeCanvas();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	});

	// Initialize canvas once it's in the DOM
	$effect(() => {
		if (canvasEl && joined) {
			initCanvas();
		}
	});

	onDestroy(() => {
		wb.disconnect();
	});
</script>

<svelte:head>
	<title>Dendri Whiteboard</title>
</svelte:head>

<div class="h-screen bg-background text-foreground flex flex-col overflow-hidden">
	<!-- Header -->
	<header class="border-b border-neutral-200 px-6 py-3 shrink-0">
		<div class="max-w-5xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Whiteboard</a>
			<div class="flex items-center gap-3 text-sm text-slate-600">
				{#if joined}
					<span>{wb.peerCount} peer{wb.peerCount !== 1 ? "s" : ""}</span>
					{#if wb.isHost}
						<span class="text-xs bg-slate-100 text-slate-700 ring-1 ring-black/5 px-2 py-0.5 rounded-full">Host</span>
					{/if}
					<span class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full {wb.status === 'connected' ? 'bg-green-500' : wb.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}"></span>
						{wb.status === "connected" ? "Connected" : wb.status === "connecting" ? "Connecting..." : "Disconnected"}
					</span>
				{/if}
			</div>
		</div>
	</header>

	{#if !joined}
		<!-- Join Room -->
		<div class="flex-1 flex items-center justify-center">
			<div class="bg-white border border-neutral-200 rounded-lg p-8 w-full max-w-sm">
				<h2 class="text-lg font-medium text-slate-900 mb-4">Join a whiteboard</h2>
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
					Open this page in multiple tabs with the same room name to draw together.
				</p>
			</div>
		</div>
	{:else}
		<!-- Room Info -->
		<div class="border-b border-neutral-200 px-6 py-2 shrink-0">
			<div class="max-w-5xl mx-auto flex items-center gap-4">
				<p class="text-xs text-slate-500 flex items-center gap-1.5">Room: <span class="font-mono text-slate-700">{roomId}</span>
					<button
						class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
						onclick={() => navigator.clipboard.writeText(roomId)}
						title="Copy room ID"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					</button>
				</p>
				{#if wb.myId}
					<span class="text-neutral-300">|</span>
					<p class="text-xs text-slate-500 flex items-center gap-1.5">Your ID: <span class="font-mono text-slate-700">{wb.myId}</span>
						<button
							class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
							onclick={() => navigator.clipboard.writeText(wb.myId)}
							title="Copy your ID"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						</button>
					</p>
				{/if}
			</div>
		</div>

		<!-- Toolbar -->
		<div class="border-b border-neutral-200 px-6 py-2 shrink-0">
			<div class="max-w-5xl mx-auto flex flex-wrap items-center gap-2 sm:gap-4">
				<!-- Color Picker -->
				<div class="flex items-center gap-1.5">
					{#each COLORS as color}
						<button
							onclick={() => selectedColor = color}
							class="w-7 h-7 rounded-full border-2 transition-all {selectedColor === color ? 'border-slate-900 scale-110' : 'border-neutral-300 hover:border-slate-400'}"
							style="background: {color};"
							title={color}
						></button>
					{/each}
				</div>

				<!-- Divider -->
				<div class="w-px h-6 bg-neutral-200"></div>

				<!-- Brush Size -->
				<div class="flex items-center gap-2">
					<span class="text-xs text-slate-500">Size</span>
					<input
						type="range"
						min="1"
						max="20"
						bind:value={brushSize}
						class="w-24 accent-blue-500"
					/>
					<span class="text-xs text-slate-500 w-5 text-right">{brushSize}</span>
				</div>

				<!-- Divider -->
				<div class="w-px h-6 bg-neutral-200"></div>

				<!-- Clear -->
				<button
					onclick={handleClear}
					class="text-sm text-slate-500 hover:text-red-500 transition-colors px-3 py-1 rounded hover:bg-red-50"
				>
					Clear All
				</button>

				<!-- Stroke count -->
				<span class="ml-auto text-xs text-slate-400">{wb.strokes.length} stroke{wb.strokes.length !== 1 ? "s" : ""}</span>
			</div>
		</div>

		<!-- Canvas -->
		<div class="flex-1 p-4 min-h-0">
			<div class="max-w-5xl mx-auto h-full">
				<canvas
					bind:this={canvasEl}
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerup={handlePointerUp}
					onpointerleave={handlePointerUp}
					class="w-full h-full bg-white border border-neutral-200 rounded-lg cursor-crosshair touch-none"
				></canvas>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="border-t border-neutral-200 px-6 py-2 shrink-0">
		<div class="max-w-5xl mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 underline" target="_blank" rel="noopener noreferrer">Afterrealism</a></p>
		</div>
	</footer>
</div>
