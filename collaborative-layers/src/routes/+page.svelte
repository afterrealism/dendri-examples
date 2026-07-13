<script lang="ts">
	import { onDestroy } from "svelte";
	import { Deck } from "@deck.gl/core";
	import { TileLayer } from "@deck.gl/geo-layers";
	import { BitmapLayer, ScatterplotLayer, ColumnLayer } from "@deck.gl/layers";
	import { HeatmapLayer } from "@deck.gl/aggregation-layers";
	import { createMapPeer, type LayerId, type LayerSettings } from "$lib/dendri.svelte";
	import { generatePoints, SEATTLE } from "$lib/data";

	const peer = createMapPeer();
	const points = generatePoints(180, SEATTLE);

	let roomId = $state("dendri-layers");
	let joined = $state(false);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let deck: Deck | undefined;

	const INITIAL_VIEW_STATE = {
		longitude: SEATTLE[0],
		latitude: SEATTLE[1],
		zoom: 9,
		pitch: 35,
		bearing: 0,
	};

	function buildLayers() {
		const { scatter, heatmap, column } = peer.layers;
		const baseTile = new TileLayer({
			id: "osm-tiles",
			data: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
			minZoom: 0,
			maxZoom: 19,
			tileSize: 256,
			renderSubLayers: (props: any) => {
				const { boundingBox } = props.tile;
				return new BitmapLayer(props, {
					data: undefined,
					image: props.data,
					bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
				});
			},
		});

		const layers: any[] = [baseTile];

		if (heatmap.visible) {
			layers.push(
				new HeatmapLayer({
					id: "heatmap",
					data: points,
					getPosition: (d) => d.position,
					getWeight: (d) => d.weight * heatmap.scale,
					radiusPixels: 60 * heatmap.scale,
					intensity: 1,
					threshold: 0.05,
					opacity: heatmap.opacity,
				}),
			);
		}

		if (scatter.visible) {
			layers.push(
				new ScatterplotLayer({
					id: "scatter",
					data: points,
					getPosition: (d) => d.position,
					getRadius: (d) => 200 + d.weight * 10 * scatter.scale,
					getFillColor: [255, 99, 71],
					getLineColor: [255, 255, 255],
					stroked: true,
					lineWidthMinPixels: 1,
					radiusUnits: "meters",
					opacity: scatter.opacity,
					pickable: true,
				}),
			);
		}

		if (column.visible) {
			layers.push(
				new ColumnLayer({
					id: "column",
					data: points,
					getPosition: (d) => d.position,
					getElevation: (d) => d.weight * 80 * column.scale,
					getFillColor: (d) => [40, 120, 220, 200],
					radius: 600,
					extruded: true,
					opacity: column.opacity,
					elevationScale: 1,
				}),
			);
		}

		return layers;
	}

	function initDeck() {
		if (!canvasEl) return;
		deck = new Deck({
			canvas: canvasEl,
			initialViewState: INITIAL_VIEW_STATE,
			controller: true,
			layers: buildLayers(),
		});
	}

	$effect(() => {
		void peer.layers;
		if (deck) {
			deck.setProps({ layers: buildLayers() });
		}
	});

	function join() {
		if (!roomId.trim()) return;
		peer.connect(roomId.trim());
		joined = true;
		queueMicrotask(initDeck);
	}

	function setVisible(id: LayerId, v: boolean) {
		peer.setLayerProp(id, "visible", v);
	}

	function setOpacity(id: LayerId, v: number) {
		peer.setLayerProp(id, "opacity", v);
	}

	function setScale(id: LayerId, v: number) {
		peer.setLayerProp(id, "scale", v);
	}

	onDestroy(() => {
		deck?.finalize();
		peer.disconnect();
	});

	const LAYER_META: Array<{ id: LayerId; title: string; scaleLabel: string; min: number; max: number; step: number }> = [
		{ id: "scatter", title: "Scatterplot", scaleLabel: "Radius", min: 0.2, max: 3, step: 0.1 },
		{ id: "heatmap", title: "Heatmap", scaleLabel: "Intensity", min: 0.2, max: 3, step: 0.1 },
		{ id: "column", title: "Columns (3D)", scaleLabel: "Elevation", min: 0.2, max: 3, step: 0.1 },
	];
</script>

<svelte:head>
	<title>Dendri Collaborative Layers</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 no-underline">
				Dendri Collaborative Layers
			</a>
			<div class="flex items-center gap-3 text-sm text-slate-600">
				{#if joined}
					<span class="inline-flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full {peer.status === 'connected' ? 'bg-emerald-500' : peer.status === 'connecting' ? 'bg-amber-400' : 'bg-slate-300'}"></span>
						{peer.status}
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
					Open this page in multiple tabs with the same room name. Adjusting any layer setting will sync to every peer.
				</p>
			</div>
		</div>
	{:else}
		<div class="flex-1 flex flex-col lg:flex-row">
			<aside class="w-full lg:w-80 border-r border-neutral-200 bg-white p-4 flex flex-col gap-4 overflow-y-auto max-h-[50vh] lg:max-h-none">
				<div>
					<p class="text-xs uppercase tracking-wide text-slate-500 mb-1">Room</p>
					<p class="font-mono text-sm text-slate-700">{roomId}</p>
				</div>
				<hr class="border-neutral-200" />
				{#each LAYER_META as meta}
					{@const settings = peer.layers[meta.id]}
					<section class="flex flex-col gap-2">
						<header class="flex items-center justify-between">
							<h3 class="text-sm font-medium text-slate-900">{meta.title}</h3>
							<label class="inline-flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={settings.visible}
									onchange={(e) => setVisible(meta.id, (e.currentTarget as HTMLInputElement).checked)}
									data-testid="visible-{meta.id}"
									class="w-4 h-4 accent-slate-900"
								/>
								<span class="text-xs text-slate-600">visible</span>
							</label>
						</header>
						<label class="flex flex-col gap-1">
							<span class="text-xs text-slate-500 flex justify-between">
								<span>Opacity</span>
								<span class="font-mono text-slate-700" data-testid="opacity-value-{meta.id}">{settings.opacity.toFixed(2)}</span>
							</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={settings.opacity}
								oninput={(e) => setOpacity(meta.id, Number((e.currentTarget as HTMLInputElement).value))}
								data-testid="opacity-{meta.id}"
								class="w-full"
							/>
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-xs text-slate-500 flex justify-between">
								<span>{meta.scaleLabel}</span>
								<span class="font-mono text-slate-700" data-testid="scale-value-{meta.id}">{settings.scale.toFixed(2)}×</span>
							</span>
							<input
								type="range"
								min={meta.min}
								max={meta.max}
								step={meta.step}
								value={settings.scale}
								oninput={(e) => setScale(meta.id, Number((e.currentTarget as HTMLInputElement).value))}
								data-testid="scale-{meta.id}"
								class="w-full"
							/>
						</label>
					</section>
					<hr class="border-neutral-200" />
				{/each}
				<p class="text-xs text-slate-400 mt-auto">
					Settings sync via Yjs. Open another tab on the same room to see real-time changes.
				</p>
			</aside>
			<div class="flex-1 relative">
				<canvas bind:this={canvasEl} class="absolute inset-0 w-full h-full"></canvas>
				<div class="absolute bottom-3 right-3 text-[10px] text-slate-700 bg-white/80 backdrop-blur px-2 py-1 rounded">
					© <a href="https://www.openstreetmap.org/copyright" class="underline">OpenStreetMap</a> contributors
				</div>
			</div>
		</div>
	{/if}

	<footer class="border-t border-neutral-200 px-6 py-3">
		<div class="max-w-6xl mx-auto text-center">
			<p class="text-xs text-slate-400">
				Built by <a href="https://afterrealism.com" class="hover:text-slate-600 underline" target="_blank" rel="noopener noreferrer">Afterrealism</a>
			</p>
		</div>
	</footer>
</div>
