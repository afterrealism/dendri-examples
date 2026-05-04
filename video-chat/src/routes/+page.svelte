<script lang="ts">
	import { goto } from "$app/navigation";

	function trackEvent(name: string, props?: Record<string, string>) {
		try { (window as any).rybbit?.event(name, props); } catch {}
	}

	let roomInput = $state("");

	function createRoom() {
		const roomId = crypto.randomUUID();
		trackEvent("room_created", { room: roomId });
		goto(`/${roomId}`);
	}

	function joinRoom() {
		const trimmed = roomInput.trim();
		if (!trimmed) return;

		// Support pasting a full URL like https://video.dendri.dev/<roomId>
		let roomId = trimmed;
		try {
			const url = new URL(trimmed);
			const path = url.pathname.replace(/^\/+/, "");
			if (path) roomId = path;
		} catch {
			// Not a URL — use as-is
		}

		trackEvent("room_joined_manual", { room: roomId });
		goto(`/${roomId}`);
	}
</script>

<svelte:head>
	<title>Dendri Video Chat</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<header class="border-b border-neutral-200 px-6 py-4">
		<div class="max-w-lg mx-auto">
			<a href="https://dendri.dev/" class="text-lg font-semibold text-slate-900 hover:text-slate-600 transition-colors no-underline">Dendri Video Chat</a>
		</div>
	</header>

	<div class="flex-1 flex items-center justify-center px-6">
		<div class="w-full max-w-sm">
			<div class="bg-white border border-neutral-200 rounded-lg p-8 shadow-sm">
				<h2 class="text-lg font-medium text-slate-900 mb-6 text-center">Start a video call</h2>

				<button
					onclick={createRoom}
					class="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer"
				>
					Create New Room
				</button>

				<div class="flex items-center gap-3 my-6">
					<div class="flex-1 h-px bg-neutral-200"></div>
					<span class="text-xs text-slate-400">or join existing</span>
					<div class="flex-1 h-px bg-neutral-200"></div>
				</div>

				<form onsubmit={(e) => { e.preventDefault(); joinRoom(); }} class="flex flex-col gap-3">
					<input
						type="text"
						bind:value={roomInput}
						placeholder="Paste room ID or URL..."
						class="border border-neutral-300 rounded-md px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
					/>
					<button
						type="submit"
						disabled={!roomInput.trim()}
						class="bg-secondary hover:bg-secondary/80 text-secondary-foreground disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
					>
						Join Room
					</button>
				</form>

				<p class="text-xs text-slate-400 mt-4 text-center">
					Create a room and share the link for others to join.
				</p>
			</div>
		</div>
	</div>

	<footer class="border-t border-neutral-200 px-6 py-4">
		<div class="max-w-lg mx-auto text-center">
			<p class="text-xs text-slate-400">Built by <a href="https://afterrealism.com" class="hover:text-slate-600 transition-colors underline underline-offset-2">Afterrealism</a></p>
		</div>
	</footer>
</div>
