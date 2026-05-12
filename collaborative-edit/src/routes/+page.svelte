<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { Deck } from "@deck.gl/core";
	import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
	import { EditableGeoJsonLayer } from "@deck.gl-community/editable-layers";
	import type { Feature } from "geojson";
	import { MODE_CATEGORIES } from "$lib/modes";
	import { createCollaborativeEditor } from "$lib/editor.svelte";
	import { hexToRgb, peerColor } from "$lib/colors";

	// =====================================================================
	// Collaborative editor — multi-peer EditableGeoJsonLayer over Yjs.
	//
	// Layout follows samples/deckgl-layers/editable-layers-advanced:
	//   topbar = mode picker (full Draw / Alter / Composite catalog)
	//   sidebar = feature list + peer presence
	//   map = deck.gl canvas with EditableGeoJsonLayer + remote-cursor overlay
	//
	// All shared state goes through `editor` (see src/lib/editor.svelte.ts):
	//   editor.data       → Yjs-backed FeatureCollection
	//   editor.viewport   → Yjs-backed view state (50ms throttle)
	//   editor.peers      → Awareness-derived presence
	//   editor.mySelection / myMode / myName → local awareness fields
	// =====================================================================

	const editor = createCollaborativeEditor();

	let roomId = $state("dendri-collab-edit");
	let displayName = $state("");
	let joined = $state(false);
	let sidebarOpen = $state(false);

	let container: HTMLDivElement | undefined = $state();
	let deck: Deck | null = null;

	// Mode object — kept locally because mode classes/instances aren't
	// serializable. The id (`editor.myMode`) is what we mirror via awareness.
	const initialEntry = MODE_CATEGORIES.flatMap((c) => c.modes).find(
		(m) => m.id === "draw-polygon",
	)!;
	let modeObj = $state<unknown>(initialEntry.mode);

	function selectMode(id: string, next: unknown) {
		modeObj = next;
		editor.setMode(id);
	}

	function describeFeature(f: Feature, i: number): string {
		const t = f.geometry?.type ?? "Unknown";
		return `${i}: ${t}`;
	}

	function join() {
		if (!roomId.trim()) return;
		editor.connect(roomId.trim(), displayName.trim() || undefined);
		joined = true;
	}

	// ===== Remote-cursor overlay layer =====
	type CursorPoint = {
		position: [number, number];
		color: [number, number, number];
		label: string;
	};
	function buildCursorLayers() {
		const cursorPeers = editor.peers.filter((p) => p.cursor !== null);
		if (cursorPeers.length === 0) return [];
		const points: CursorPoint[] = cursorPeers.map((p) => ({
			position: [p.cursor!.lon, p.cursor!.lat],
			color: hexToRgb(p.color),
			label: p.name,
		}));
		return [
			new ScatterplotLayer({
				id: "remote-cursors",
				data: points,
				getPosition: (d: CursorPoint) => d.position,
				getRadius: 8,
				radiusUnits: "pixels",
				getFillColor: (d: CursorPoint) => [...d.color, 220],
				getLineColor: [255, 255, 255, 255],
				lineWidthUnits: "pixels",
				getLineWidth: 2,
				stroked: true,
				pickable: false,
			} as any),
			new TextLayer({
				id: "remote-cursor-labels",
				data: points,
				getPosition: (d: CursorPoint) => d.position,
				getText: (d: CursorPoint) => d.label,
				getColor: [15, 23, 42, 255],
				getSize: 12,
				getPixelOffset: [12, -12],
				getTextAnchor: "start",
				getAlignmentBaseline: "center",
				background: true,
				getBackgroundColor: [255, 255, 255, 230],
				backgroundPadding: [4, 2],
				pickable: false,
			} as any),
		];
	}

	function buildEditLayer() {
		return new EditableGeoJsonLayer({
			id: "editable-geojson-layer",
			data: editor.data,
			mode: modeObj as any,
			modeConfig: {},
			selectedFeatureIndexes: editor.mySelection,
			onEdit: ((event: any) => {
				const { updatedData, editType, editContext } = event;
				editor.applyLocalEdit(updatedData, editType, editContext);
				if (editType === "addFeature" && editContext) {
					const idx = (editContext as any).featureIndexes ?? [];
					if (idx.length > 0) editor.setSelection(idx);
				}
			}) as any,
			pickable: true,
			autoHighlight: false,
			editHandleType: "point",
			pointRadiusMinPixels: 5,
			getFillColor: [...hexToRgb(editor.myColor), 144] as any,
			getLineColor: [0, 0, 0, 255],
			getEditHandlePointColor: [...hexToRgb(editor.myColor), 255] as any,
			editHandlePointRadiusScale: 2,
			_subLayerProps: {},
			parameters: { depthTest: false, blend: true } as any,
			opacity: 1,
			visible: true,
		} as any);
	}

	// ===== Deck setup =====
	onMount(() => {
		if (!container) return;
		deck = new Deck({
			parent: container,
			initialViewState: editor.viewport,
			controller: true,
			layers: [buildEditLayer(), ...buildCursorLayers()],
			onViewStateChange: ({ viewState }: any) => {
				editor.setViewport({
					longitude: viewState.longitude,
					latitude: viewState.latitude,
					zoom: viewState.zoom,
					bearing: viewState.bearing ?? 0,
					pitch: viewState.pitch ?? 0,
				});
			},
			onHover: ({ coordinate }: any) => {
				if (coordinate) {
					editor.setCursor(coordinate[0], coordinate[1]);
				} else {
					editor.setCursor(null, null);
				}
			},
		});

		const stop = $effect.root(() => {
			$effect(() => {
				void editor.data;
				void editor.mySelection;
				void editor.peers;
				void modeObj;
				deck?.setProps({
					layers: [buildEditLayer(), ...buildCursorLayers()],
				});
			});

			$effect(() => {
				const v = editor.viewport;
				deck?.setProps({ viewState: v });
			});
		});

		return () => {
			stop();
			deck?.finalize();
			deck = null;
		};
	});

	onDestroy(() => {
		editor.disconnect();
	});
</script>

<svelte:head>
	<title>Dendri Collaborative Editor</title>
</svelte:head>

{#if !joined}
	<div class="join">
		<form
			onsubmit={(e) => {
				e.preventDefault();
				join();
			}}
		>
			<h1>Collaborative GeoJSON editor</h1>
			<p class="hint">
				Open this page in multiple tabs (or share with peers) using
				the same room name to draw and edit shapes together.
			</p>
			<label>
				Room
				<input bind:value={roomId} placeholder="Room name..." />
			</label>
			<label>
				Display name <span class="opt">(optional)</span>
				<input bind:value={displayName} placeholder="e.g. Alex" />
			</label>
			<button type="submit">Join</button>
		</form>
	</div>
{:else}
	<div class="layout">
		<header class="topbar">
			<div class="status">
				<button
					class="sidebar-toggle"
					onclick={() => (sidebarOpen = !sidebarOpen)}
					aria-label="Toggle sidebar"
				>
					<span></span><span></span><span></span>
				</button>
				<span
					class="dot"
					class:on={editor.connectionState === "connected"}
					class:warn={editor.connectionState === "connecting"}
				></span>
				<span class="muted">{editor.connectionState}</span>
				<span class="muted">
					· {editor.peerCount} peer{editor.peerCount === 1
						? ""
						: "s"}
				</span>
				{#if editor.isHost}
					<span class="badge">host</span>
				{/if}
				<span class="muted room">room: <code>{roomId}</code></span>
			</div>
			<div class="modes">
				{#each MODE_CATEGORIES as category (category.id)}
					<fieldset>
						<legend>{category.label}</legend>
						{#each category.modes as entry (entry.id)}
							<button
								type="button"
								class:active={editor.myMode === entry.id}
								onclick={() => selectMode(entry.id, entry.mode)}
							>
								{entry.label}
							</button>
						{/each}
					</fieldset>
				{/each}
			</div>
		</header>

		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="sidebar-overlay"
			class:visible={sidebarOpen}
			onclick={() => (sidebarOpen = false)}
			role="presentation"
		></div>

		<aside class="sidebar" class:open={sidebarOpen}>
			<section>
				<h2>You</h2>
				<div class="me">
					<span
						class="swatch"
						style="background: {editor.myColor};"
					></span>
					<span class="me-name">
						{displayName || (editor.myId ? editor.myId.slice(0, 6) : "...")}
					</span>
				</div>
			</section>

			<section>
				<h2>Peers ({editor.peers.length})</h2>
				{#if editor.peers.length === 0}
					<p class="empty">Just you so far.</p>
				{:else}
					<ul class="peers">
						{#each editor.peers as peer (peer.id)}
							<li>
								<span
									class="swatch"
									style="background: {peer.color};"
								></span>
								<div class="peer-info">
									<div class="peer-name">{peer.name}</div>
									<div class="peer-meta">{peer.mode}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section>
				<div class="features-head">
					<h2>Features ({editor.data.features.length})</h2>
					{#if editor.data.features.length > 0}
						<button
							type="button"
							class="link danger"
							onclick={() => editor.clearAllFeatures()}
						>
							clear all
						</button>
					{/if}
				</div>
				{#if editor.data.features.length === 0}
					<p class="empty">
						No features yet. Pick a Draw mode and click on the
						canvas.
					</p>
				{:else}
					<ul class="features">
						{#each editor.data.features as feature, i (i)}
							<li class:selected={editor.mySelection.includes(i)}>
								<button
									type="button"
									class="feat"
									onclick={() => editor.selectFeature(i)}
								>
									{describeFeature(feature, i)}
								</button>
								<button
									type="button"
									class="del"
									onclick={() => editor.removeFeature(i)}
								>
									delete
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</aside>

		<div bind:this={container} class="map"></div>
	</div>
{/if}

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		color: #0f172a;
	}

	.join {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: #f1f5f9;
	}
	.join form {
		background: white;
		padding: 1.75rem 2rem;
		border-radius: 12px;
		box-shadow: 0 6px 30px rgba(15, 23, 42, 0.08);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		max-width: 360px;
		width: 100%;
	}
	@media (max-width: 400px) {
		.join form {
			padding: 1.25rem 1rem;
			border-radius: 0;
			box-shadow: none;
		}
	}
	.join h1 {
		margin: 0;
		font-size: 1.15rem;
	}
	.join .hint {
		color: #64748b;
		margin: 0 0 0.25rem;
		font-size: 0.85rem;
	}
	.join label {
		display: flex;
		flex-direction: column;
		font-size: 0.8rem;
		color: #334155;
		gap: 0.25rem;
	}
	.join .opt {
		color: #94a3b8;
		font-weight: normal;
	}
	.join input {
		font: inherit;
		padding: 0.5rem 0.65rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
	}
	.join button {
		font: inherit;
		font-weight: 600;
		padding: 0.55rem 1rem;
		background: #0f172a;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}

	.layout {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 260px 1fr;
		grid-template-rows: auto 1fr;
		grid-template-areas:
			"topbar topbar"
			"sidebar map";
	}
	.topbar {
		grid-area: topbar;
		background: #0b1726;
		color: #e6edf3;
		border-bottom: 1px solid #1f2a3a;
		display: flex;
		flex-direction: column;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.78rem;
		border-bottom: 1px solid #1f2a3a;
	}
	.status .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ef4444;
	}
	.status .dot.on {
		background: #22c55e;
	}
	.status .dot.warn {
		background: #eab308;
	}
	.status .muted {
		color: #8aa4c8;
	}
	.status .badge {
		font-size: 0.65rem;
		text-transform: uppercase;
		padding: 0.05rem 0.4rem;
		border-radius: 4px;
		background: #1e3a8a;
		color: #c7d2fe;
	}
	.status .room {
		margin-left: auto;
	}
	.status code {
		color: #e6edf3;
	}
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem;
	}
	.modes fieldset {
		border: 1px solid #1f2a3a;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0;
	}
	.modes legend {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #8aa4c8;
		padding: 0 0.25rem;
	}
	.modes button {
		font: inherit;
		font-size: 0.78rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid #2a3a52;
		background: #11202f;
		color: #e6edf3;
		border-radius: 3px;
		cursor: pointer;
	}
	.modes button.active {
		background: #5dd6ff;
		color: #0b1726;
		border-color: #5dd6ff;
	}

	.sidebar {
		grid-area: sidebar;
		background: #f5f7fa;
		border-right: 1px solid #d0d7de;
		padding: 0.75rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.sidebar h2 {
		font-size: 0.8rem;
		margin: 0 0 0.4rem;
		color: #475569;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.sidebar .empty {
		font-size: 0.78rem;
		color: #64748b;
		margin: 0;
	}
	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid rgba(15, 23, 42, 0.15);
		flex-shrink: 0;
	}
	.me {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.me-name {
		font-weight: 500;
	}
	.peers {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.peers li {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.peer-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.peer-name {
		font-size: 0.8rem;
		font-weight: 500;
	}
	.peer-meta {
		font-size: 0.7rem;
		color: #64748b;
	}
	.features-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.4rem;
	}
	.features-head h2 {
		margin: 0;
	}
	.link {
		font: inherit;
		font-size: 0.75rem;
		background: none;
		border: none;
		color: #475569;
		cursor: pointer;
		padding: 0.1rem 0.25rem;
	}
	.link.danger {
		color: #cf222e;
	}
	.features {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.features li {
		display: flex;
		gap: 0.25rem;
		align-items: stretch;
	}
	.features li.selected .feat {
		background: #5dd6ff;
		color: #0b1726;
		border-color: #5dd6ff;
	}
	.features button {
		font: inherit;
		font-size: 0.78rem;
		border: 1px solid #d0d7de;
		background: white;
		border-radius: 3px;
		cursor: pointer;
	}
	.features .feat {
		flex: 1;
		text-align: left;
		padding: 0.25rem 0.5rem;
	}
	.features .del {
		padding: 0.25rem 0.5rem;
		color: #cf222e;
	}
	.map {
		grid-area: map;
		position: relative;
		background: #f5f5f5;
		overflow: hidden;
	}

	/* ---- mobile sidebar toggle (hidden on desktop) ---- */
	.sidebar-toggle {
		display: none;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		width: 24px;
		height: 24px;
		padding: 0;
		margin: 0;
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
	}
	.sidebar-toggle span {
		display: block;
		width: 18px;
		height: 2px;
		background: #e6edf3;
		border-radius: 1px;
		transition: background 0.15s;
	}

	/* ---- sidebar overlay backdrop (hidden on desktop) ---- */
	.sidebar-overlay {
		display: none;
	}
	.sidebar-overlay.visible {
		display: block;
		position: fixed;
		inset: 0;
		z-index: 49;
		background: rgba(0, 0, 0, 0.35);
	}

	/* ==================================================================
	   MOBILE — screens below 768px
	   - single-column grid (sidebar becomes a fixed overlay drawer)
	   - topbar modes scroll horizontally on overflow
	   - join form fills available width
	   ================================================================== */
	@media (max-width: 767px) {
		.layout {
			grid-template-columns: 1fr;
			grid-template-areas:
				"topbar"
				"map";
		}

		.sidebar-toggle {
			display: flex;
		}

		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			z-index: 50;
			width: 280px;
			max-width: 80vw;
			transform: translateX(-100%);
			transition: transform 0.25s ease;
			box-shadow: 2px 0 20px rgba(0, 0, 0, 0.15);
			border-right: 1px solid #d0d7de;
		}
		.sidebar.open {
			transform: translateX(0);
		}

		.modes {
			overflow-x: auto;
			scrollbar-width: none;
			flex-wrap: nowrap;
		}
		.modes::-webkit-scrollbar {
			display: none;
		}
		.modes fieldset {
			flex-shrink: 0;
		}
	}
</style>
