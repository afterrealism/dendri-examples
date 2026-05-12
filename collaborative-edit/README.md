# collaborative-edit

Multi-peer GeoJSON editor: every shape draw, vertex move, rotate, scale, and
delete is synchronised across all connected browsers in real time over WebRTC.

Combines two existing samples:

- `dendri-examples/whiteboard/` — dendri-y (Yjs over Dendri WebRTC) wiring
- `samples/deckgl-layers/editable-layers-advanced/` — full Draw / Alter /
  Composite mode catalog from `@deck.gl-community/editable-layers`

The novel piece is `src/lib/editor.svelte.ts`, a Yjs ↔ `EditableGeoJsonLayer`
bridge that ships per-feature mutations so concurrent edits on different
features never clobber each other.

---

## Run it

You need the Dendri signaling server reachable on `localhost:9876`.

In one terminal, from the workspace root:

```sh
cd dendri-server
cargo run --release
```

In a second terminal, from this folder:

```sh
npm install
npm run dev
```

Open the printed URL in **two or more** browser windows. Use the same room
name on each. Whatever shapes you draw or modify in one window appear and
update live in the others, with each peer's cursor rendered in their own
deterministic color.

---

## Architecture

```
+--------------------+       Yjs CRDT       +--------------------+
| EditableGeoJsonLayer| <---------------->  | EditableGeoJsonLayer|
|   (peer A)          |                     |   (peer B)          |
+---------+----------+                      +----------+---------+
          |                                            |
          | onEdit({updatedData, editType,             |
          |          editContext.featureIndexes})      |
          v                                            v
+---------+------------------------------------------+ +
|     editor.svelte.ts  (Y.Doc bridge per peer)       |
|                                                     |
|   yfeatures = Y.Array<Y.Map>   one Y.Map / feature  |
|     .geometry  : geojson Geometry (LWW per field)   |
|     .properties: Record<string, unknown>            |
|                                                     |
|   yviewport = Y.Map  longitude/latitude/zoom/...    |
|                                                     |
|   awareness                                         |
|     cursor  : { lon, lat } | null   (50ms throttle) |
|     mode    : active edit-mode id                   |
|     selection: number[]                             |
|     color   : deterministic from peerId             |
|     name    : short label                           |
+-----------------------------------------------------+
                          |
                          v
              DendriYjsProvider (y-dendri)
                          |
                          v
              Dendri P2P mesh (WebRTC, with
              4-tier transport fallback)
```

Loop prevention: every local mutation is wrapped in `ydoc.transact(fn,
LOCAL_ORIGIN)` and the observers ignore transactions whose `origin ===
LOCAL_ORIGIN`. Remote / sync transactions rebuild the Svelte `$state` which
re-renders the deck.gl layer.

Per-feature granularity: storing each feature in its own `Y.Map` (rather
than the FeatureCollection as a single value) means two users editing
*different* features never conflict; same-feature concurrent edits resolve
last-write-wins per field (`geometry`, `properties`).

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/editor.svelte.ts` | Yjs ↔ EditableGeoJsonLayer bridge. Exports `createCollaborativeEditor()` returning reactive getters and methods for the page to consume. |
| `src/lib/modes.ts`         | Mode catalog (View / Draw / Alter / Composite). 1:1 copy of the editable-layers-advanced sample. |
| `src/lib/colors.ts`        | Deterministic per-peer color from peerId. |
| `src/routes/+page.svelte`  | UI shell — join screen, mode toolbar, sidebar (peers + features), deck.gl canvas with `EditableGeoJsonLayer` and remote-cursor overlay. |

---

## What syncs

| State                | Mechanism                  | Notes |
|----------------------|----------------------------|-------|
| FeatureCollection    | `Y.Array<Y.Map>` per-feature | All draw / alter / delete edits |
| Viewport             | `Y.Map`                    | 50ms throttle on broadcast |
| Cursor position      | Awareness                  | 50ms throttle, `null` on leave |
| Active edit mode     | Awareness                  | Per-peer; not shared as state |
| Selection            | Awareness                  | Per-peer intent, not shared |
| Display name + color | Awareness                  | Color is derived from peerId |
