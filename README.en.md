# Weave (Weave)

<div align="center">

![Weave](https://img.shields.io/badge/Weave-Weave-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.8.2-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple?style=for-the-badge)

</div>

Weave is a learning workflow plugin for Obsidian focused on turning notes, memory cards, and quiz practice into one traceable and reviewable study loop.

The main plugin currently focuses on two core capability groups:

- Memory decks: subjective memorization and review scheduling based on FSRS6
- Question decks: generate quizzes from memory cards and track objective performance, including EWMA-based trend tracking

Cards, quiz items, and source references created in Weave remain linkable through block references and backlinks, so you can trace where knowledge came from and review it in context.

Minimum supported Obsidian version: 1.7.0

## Who It Is For

- People who want a full “note -> card -> review -> test” loop inside Obsidian
- People who want cards and questions to stay connected to their source notes
- People who want to sync cards with local Anki through AnkiConnect

## Core Capabilities

- Memory card study with FSRS6-based scheduling
- Question-bank and quiz workflows generated from memory cards
- Reference-based deck architecture that allows flexible deck reuse and reorganization
- Card management views including table, grid, and kanban
- Source tracing from cards or quiz items back to the original context
- AnkiConnect integration for local Anki interoperability

## About The Separate Incremental Reading Plugin

Starting after `0.8.0`, **incremental reading has been progressively split into a separate Obsidian plugin direction**.  
This README now describes the main Weave plugin only and no longer presents incremental reading as a core capability of the main plugin.

## Free vs Premium

Legend:
- `✅` available
- `❌` not included
- `⚠️` limited or fallback experience in the free version

At a glance:
- The free version already covers the main view, memory-card study, FSRS6 review, base deck study, table management, and source tracing for the core learning loop.
- Premium mainly expands the experience with question-bank workflows, deck analytics, advanced views, batch parsing, progressive cloze, image occlusion, and AI-assisted features.

| Feature | Free | Premium | Notes |
|---|---|---|---|
| Weave main view and core navigation | ✅ | ✅ | Primary plugin entry |
| Memory card study and FSRS6 review scheduling | ✅ | ✅ | Core learning capability |
| Deck study workflow | ✅ | ✅ | Base study flow |
| Table view | ✅ | ✅ | Default management view |
| View source / open source context | ✅ | ✅ | Fully free with no restrictions |
| Grid view | ⚠️ | ✅ | Free users fall back to table view with an activation prompt |
| Timeline view | ⚠️ | ✅ | Free users stay on the regular grid layout with an activation prompt |
| Kanban view | ⚠️ | ✅ | Free users fall back to table view with an activation prompt |
| Deck analytics | ❌ | ✅ | Full analytics entry is available in Premium |
| Question bank / quizzes | ❌ | ✅ | Includes test sessions and performance tracking |
| Image occlusion | ❌ | ✅ | For visual masking and recall-oriented study |
| Batch parsing system | ❌ | ✅ | For automatic parsing, mapping, and triggers |
| AI assistant | ⚠️ | ✅ | The free entry may be hidden or unavailable depending on the current implementation |
| Progressive cloze | ❌ | ✅ | Premium-only advanced study capability |

## Installation

Most users only need these three core files:
- `main.js`
- `manifest.json`
- `styles.css`

You only need the extra `sql-wasm.wasm` file if you want to use `Legacy APKG import`.

### Option 1: Community plugins

1. Open Obsidian settings
2. Go to Community plugins
3. Turn off Safe mode
4. Search for Weave
5. Install and enable

Notes:
- The community-store installation only relies on the three core files above.
- `Legacy APKG import` is an optional enhanced capability. The community-store installation does not ship the extra `sql-wasm.wasm` runtime by default.

### Option 2: Manual installation

1. Download the three core files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. If you need `Legacy APKG import`, also download:
   - `sql-wasm.wasm`
3. Copy them into:

   `.obsidian/plugins/weave/`

4. Restart Obsidian and enable the plugin

Additional notes:
- If you do not need legacy APKG import, the core three files are enough for the main plugin functionality.
- `versions.json` is repository version-compatibility metadata, not a runtime file required by the community-store installation flow.

## Quick Start

1. Open the Weave view
   - Use the ribbon icon or the command palette
2. Open settings
   - Configure data paths, decks, and feature toggles
3. Start with a closed loop
   - Create memory cards from Markdown content
   - Start learning and reviewing
   - Generate quizzes from cards and start a test session

## Default Data Locations

Weave stores its primary study data inside the current Obsidian vault under the `weave/` directory by default.

Common locations:
- Memory deck data: `weave/memory/`
- Question-bank data: `weave/question-bank/`
- Plugin-local cache and runtime state: `.obsidian/plugins/weave/`

File format overview:
- `.wdeck`: memory-deck file format used for formal deck structure and ownership data.
- `.qbank`: question-bank file format. Each question bank is stored as its own `.qbank` file.
- Markdown and attachments: your notes, images, audio, and other vault content remain stored and linked the normal Obsidian way.

Additional notes:
- The `weave/` directory mainly stores long-lived study data.
- `.obsidian/plugins/weave/` mainly stores cache, local state, logs, and other rebuildable runtime data.
- Unless you know exactly what you are doing, avoid bulk renaming, moving, or deleting `.wdeck` and `.qbank` files manually.

## Disclosures

### Payment
- Core learning features are available for free.
- Some advanced features require a valid paid license key to unlock.
- Premium activation requires an email address so the license can be associated with the user and validated across devices.

### Network Use
- **AI Assistant**: Connects to user-configured AI API endpoints. The data sent depends on the user's action and the configured provider.
- **License activation/validation**: Connects to the plugin's license service. Requests may include the license key, bound email address, derived device fingerprint, and platform information.
- **AnkiConnect**: Connects to the local Anki application through `localhost` only and does not send Anki data to a public remote server.

### File Access
- The plugin reads and writes Markdown files, attachments, card data, and learning state inside the current Obsidian vault.
- The plugin also stores local state, cache, backup, and log data under `.obsidian/plugins/weave/`.
- Vault content is not uploaded to external services unless the user explicitly uses a networked feature.

### Telemetry, Ads, and Source Code
- The plugin does not include ads.
- The plugin does not include product analytics telemetry.
- This repository contains the source code used for review and release. Private keys, server-side credentials, and other true secrets are not shipped in the client repository.

## License

This project is licensed under [GPL-3.0-or-later](LICENSE).

Support and feedback:

- Email: tutaoyuan8@outlook.com
- Issues: https://github.com/zhuzhige123/obsidian---Weave/issues

## Development

```bash
npm install
npm run dev
```

Note: development mode uses the Vite watch build flow.

## More Documentation

- Release guide: `docs/RELEASE_GUIDE.md`
- Image masking: `docs/IMAGE_MASK_GUIDE.md`
