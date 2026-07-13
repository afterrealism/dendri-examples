# Dendri Examples

Runnable examples for [Dendri](https://dendri.dev) — peer-to-peer realtime for the web
(WebRTC signaling, presence, messaging, media, and Yjs sync) built on the
[`@afterrealism/dendri-client`](https://www.npmjs.com/package/@afterrealism/dendri-client) SDK.

Each folder is a standalone app. Pick one, install, and run.

## Demos

| Demo | Shows | Stack |
| --- | --- | --- |
| [`cursors`](./cursors) | Live shared cursors across peers | SvelteKit |
| [`presence`](./presence) | Who's online + awareness state | SvelteKit |
| [`chat`](./chat) | Room chat over a shared Yjs doc | SvelteKit + Yjs |
| [`whiteboard`](./whiteboard) | Collaborative drawing canvas | SvelteKit + Yjs |
| [`video-chat`](./video-chat) | WebRTC audio/video calls with rooms | SvelteKit |
| [`file-transfer`](./file-transfer) | Peer-to-peer file sending | SvelteKit |
| [`game`](./game) | Shared multiplayer game state | SvelteKit + Yjs |
| [`collaborative-edit`](./collaborative-edit) | Collaborative geo-feature editing | SvelteKit + Yjs + deck.gl |
| [`collaborative-layers`](./collaborative-layers) | Layered collaborative canvas | SvelteKit + Yjs |
| [`react-basic`](./react-basic) | Minimal React integration | React + Vite |
| [`vue-basic`](./vue-basic) | Minimal Vue integration | Vue + Vite |

New to the SDK? Start with **`react-basic`** or **`vue-basic`** — they're the smallest.

## Run a demo

```bash
cd cursors
npm install
npm run dev
```

Open the printed URL in two browser tabs (or two devices) to watch peers sync in real time.

## Pointing at a signaling server

Every demo needs a Dendri signaling server. Two options:

**Hosted (fastest)** — grab an API key from [dendri.dev/#pricing](https://dendri.dev/#pricing),
then set two env vars before `npm run dev`:

```bash
# SvelteKit demos (cursors, presence, chat, whiteboard, video-chat, file-transfer, game, collaborative-*)
PUBLIC_DENDRI_URL="https://signal.dendri.dev" PUBLIC_DENDRI_API_KEY="dk_your_key" npm run dev

# react-basic / vue-basic
VITE_DENDRI_URL="https://signal.dendri.dev" VITE_DENDRI_API_KEY="dk_your_key" npm run dev
```

**Self-host (free)** — run the open-source server yourself (see the
[docs](https://dendri.dev/docs/#self-host)). With no env vars set, the demos default to
`ws://localhost:9876`.

## Links

- Website: [dendri.dev](https://dendri.dev)
- Docs: [dendri.dev/docs](https://dendri.dev/docs/)
- SDK: [`@afterrealism/dendri-client`](https://www.npmjs.com/package/@afterrealism/dendri-client) · [`@afterrealism/dendri-y`](https://www.npmjs.com/package/@afterrealism/dendri-y)

## License

Apache-2.0
