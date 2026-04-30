<script lang="ts">
	import { createPeer, type TransferRecord } from "$lib/dendri.svelte";
	import { onDestroy } from "svelte";

	const ft = createPeer();

	let remotePeerId = $state("");
	let selectedFile = $state<File | null>(null);
	let isDragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let sending = $state(false);

	// Auto-connect on mount
	ft.connect();

	onDestroy(() => {
		ft.clearTransfers();
		ft.disconnect();
	});

	function handleConnect() {
		if (remotePeerId.trim()) {
			ft.connectToPeer(remotePeerId.trim());
			remotePeerId = "";
		}
	}

	function handleFileSelect(files: FileList | null) {
		if (files && files.length > 0) {
			selectedFile = files[0];
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		handleFileSelect(e.dataTransfer?.files ?? null);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleSend() {
		if (!selectedFile || !ft.remotePeerConnected) return;
		sending = true;
		await ft.sendFile(selectedFile);
		selectedFile = null;
		sending = false;
		if (fileInput) {
			fileInput.value = "";
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";
		const units = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}

	function formatSpeed(bytesPerSec: number): string {
		return `${formatBytes(bytesPerSec)}/s`;
	}

	function progressPercent(t: TransferRecord): number {
		if (t.fileSize === 0) return 100;
		return Math.min(100, (t.bytesTransferred / t.fileSize) * 100);
	}
</script>

<svelte:head>
	<title>Dendri File Transfer</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-3xl mx-auto flex items-center justify-between">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri File Transfer</a>
			<div class="flex items-center gap-3 text-sm">
				<span class="flex items-center gap-1.5 text-slate-600">
					{#if ft.connectionState === "connected"}
						{#if ft.remotePeerConnected}
							<span class="w-2 h-2 rounded-full bg-green-500"></span>
							Peer connected
						{:else}
							<span class="w-2 h-2 rounded-full bg-yellow-500"></span>
							Waiting for peer
						{/if}
					{:else if ft.connectionState === "connecting"}
						<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
						Connecting...
					{:else if ft.connectionState === "disconnected" || ft.connectionState === "suspended"}
						<span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
						Reconnecting...
					{:else if ft.connectionState === "failed"}
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Failed
					{:else if ft.connectionState === "closed"}
						<span class="w-2 h-2 rounded-full bg-red-500"></span>
						Disconnected
					{:else}
						<span class="w-2 h-2 rounded-full bg-slate-400"></span>
						{ft.connectionState}
					{/if}
				</span>
			</div>
		</div>
	</header>

	<div class="max-w-3xl mx-auto w-full flex-1 flex flex-col px-6 py-16 gap-4">
		<!-- Peer ID -->
		{#if ft.myId}
			<div class="bg-white rounded-lg px-4 py-3 border border-neutral-200">
				<p class="text-xs text-slate-500 mb-1">Your Peer ID (share with the other side)</p>
				<p class="flex items-center gap-1.5">
					<span class="font-mono text-sm text-slate-700">{ft.myId}</span>
					<button
						class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
						onclick={() => navigator.clipboard.writeText(ft.myId)}
						title="Copy your ID"
					>
						<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					</button>
				</p>
			</div>
		{/if}

		<!-- Connect to Peer -->
		<form onsubmit={(e) => { e.preventDefault(); handleConnect(); }} class="flex gap-2">
			<input
				type="text"
				bind:value={remotePeerId}
				placeholder="Paste remote Peer ID..."
				class="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
			/>
			<button
				type="submit"
				disabled={!remotePeerId.trim() || ft.connectionState !== "connected"}
				class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-md text-sm font-medium transition-colors"
			>
				Connect
			</button>
		</form>

		<!-- Error -->
		{#if ft.error}
			<div class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
				{ft.error}
			</div>
		{/if}

		<!-- Drop Zone -->
		<div
			class="border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer {isDragging
				? 'border-blue-500 bg-blue-50'
				: 'border-neutral-300 hover:border-neutral-400 bg-white'}"
			role="button"
			tabindex="0"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onclick={() => fileInput?.click()}
			onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") fileInput?.click(); }}
		>
			<input
				bind:this={fileInput}
				type="file"
				class="hidden"
				onchange={(e) => handleFileSelect((e.target as HTMLInputElement).files)}
			/>
			{#if selectedFile}
				<div class="space-y-1">
					<p class="text-sm font-medium text-slate-900">{selectedFile.name}</p>
					<p class="text-xs text-slate-500">
						{formatBytes(selectedFile.size)} &middot; {selectedFile.type || "unknown type"}
					</p>
					<p class="text-xs text-slate-400 mt-2">Click or drop to change file</p>
				</div>
			{:else}
				<div class="space-y-2">
					<svg class="w-10 h-10 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
					</svg>
					<p class="text-sm text-slate-500">Drag & drop a file here, or click to browse</p>
				</div>
			{/if}
		</div>

		<!-- Send Button -->
		<button
			onclick={handleSend}
			disabled={!selectedFile || !ft.remotePeerConnected || sending}
			class="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-md text-sm font-medium transition-colors"
		>
			{#if sending}
				Sending...
			{:else if !ft.remotePeerConnected}
				Connect to a peer first
			{:else if !selectedFile}
				Select a file to send
			{:else}
				Send File
			{/if}
		</button>

		<!-- Transfers -->
		{#if ft.transfers.length > 0}
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-medium text-slate-600">Transfers</h2>
					<button
						onclick={() => ft.clearTransfers()}
						class="text-xs text-slate-400 hover:text-slate-600 transition-colors"
					>
						Clear all
					</button>
				</div>

				{#each ft.transfers as transfer (transfer.id)}
					<div class="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
						<!-- File info row -->
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-slate-900 truncate">{transfer.fileName}</p>
								<p class="text-xs text-slate-500">
									{formatBytes(transfer.fileSize)} &middot; {transfer.mimeType}
								</p>
							</div>
							<span
								class="shrink-0 text-xs px-2 py-0.5 rounded-full {transfer.direction === 'send'
									? 'bg-blue-50 text-blue-600'
									: 'bg-emerald-50 text-emerald-600'}"
							>
								{transfer.direction === "send" ? "Sent" : "Received"}
							</span>
						</div>

						<!-- Progress bar -->
						<div class="space-y-1">
							<div class="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full transition-all duration-200 {transfer.status === 'complete'
										? 'bg-green-500'
										: transfer.status === 'error'
											? 'bg-red-500'
											: 'bg-blue-500'}"
									style="width: {progressPercent(transfer)}%"
								></div>
							</div>
							<div class="flex items-center justify-between text-xs text-slate-500">
								<span>
									{formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.fileSize)}
									{#if transfer.status === "transferring"}
										&middot; {formatSpeed(transfer.speed)}
									{/if}
								</span>
								<span class="capitalize {transfer.status === 'complete'
									? 'text-green-600'
									: transfer.status === 'error'
										? 'text-red-500'
										: 'text-slate-500'}">
									{transfer.status}
								</span>
							</div>
						</div>

						<!-- Download button (received files only) -->
						{#if transfer.status === "complete" && transfer.direction === "receive" && transfer.blobUrl}
							<a
								href={transfer.blobUrl}
								download={transfer.fileName}
								class="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
							>
								<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
								</svg>
								Download
							</a>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Empty state when connected but no transfers -->
		{#if ft.transfers.length === 0 && ft.remotePeerConnected}
			<div class="flex-1 flex items-center justify-center">
				<p class="text-slate-400 text-sm text-center">
					Ready to transfer files. Select a file above and click Send.
				</p>
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<footer class="border-t border-neutral-200 px-6 py-4">
		<div class="max-w-3xl mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 transition-colors underline underline-offset-2">Afterrealism</a></p>
		</div>
	</footer>
</div>
