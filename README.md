Frame TV Art Card (MQTT)
========================

Overview

- Lovelace card to pick one or more art collections and view artwork metadata.
- Uses MQTT-discovered sensors from the `samsung-tv-art` container (no YAML helpers).
- Publishes MQTT commands to the container for add/remove/clear/set actions.

Installation

- Place `samsung-tv-art-card.js` in `/config/www/samsung-tv-art-card/` and add a resource:
	- url: `/local/samsung-tv-art-card/samsung-tv-art-card.js?v=1.0.0`
	- type: `module`

Basic usage (example)

```
- view_layout:
		grid-area: frametvartmode1
	type: custom:frame-tv-art-card
	title: Frame TV Art
	# Defaults assume MQTT-discovered sensors; override only if needed
	# collections_entity: sensor.frame_tv_art_collections
	# selected_artwork_file_entity: sensor.frame_tv_selected_artwork
	# selected_collections_entity: sensor.frame_tv_selected_collections
	image_path: /local/images/frame_tv_art_collections
```

How it works

- Options shown in the dropdown come from `sensor.frame_tv_art_collections` attributes.options (published by the container).
- Selected artwork and extended metadata come from `sensor.frame_tv_selected_artwork` and its attributes.
- When you add/remove/clear selections in the UI, the card publishes to:
	- `frame_tv/cmd/collections/add|remove|clear|set|refresh`
	- Payloads include `{ collection, collections[], req_id }` as appropriate.
- The container mirrors the current selection (retained) at `frame_tv/selected_collections/state` and acknowledges commands at `frame_tv/ack/<cmd>`.

Advanced

- Set a specific artwork immediately (bypassing collection upload timing) by publishing to:
	- Topic: `frame_tv/cmd/artwork/set`
	- Payload: `{ "path": "Collection/file.jpg", "req_id": "<any>" }`

Legacy helpers

- Not required. The card can optionally fall back to `input_button` and `input_select` if explicitly configured, but MQTT is the preferred path.
