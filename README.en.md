# Weave (Weave)

<div align="center">

![Weave](https://img.shields.io/badge/Weave-Weave-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.8.2-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple?style=for-the-badge)

</div>

Weave is a learning workflow plugin built specifically for Obsidian. The main in-plugin UI view is called Weave.

Weave connects three stages into one traceable, verifiable, and reviewable learning loop:

- Reading decks: reading material management and incremental reading workflows
- Memory decks: subjective memorization and review scheduling based on FSRS6
- Question decks: generate quizzes from memory cards and track objective performance (including EWMA trend tracking)

In this loop, your excerpt notes, memory cards, and quiz questions can all be located via block references and backlinks, making everything traceable and interconnected.

Minimum supported Obsidian version: 1.7.0

## Plugin Introduction

Weave means “to weave”. It is a plugin that focuses on three core modules: Reading Decks, Memory Decks, and Question Decks. It applies TVP-DS, FSRS6, and EWMA algorithms respectively, and is designed to serve Obsidian across all platforms. Its functions target:

- Transforming external reading materials into internal knowledge documents
- Creating memory cards from any Obsidian Markdown content for subjective memorization and review
- Using generated memory cards to create quizzes and verify learning outcomes objectively

Here, all your excerpt notes, memory cards, and quiz questions can be precisely traced through block references, forming a coherent and reinforcing loop to help you consolidate and master your own Obsidian knowledge network.

You can move the main Weave view into Obsidian’s sidebar. By clicking related documents, Weave can automatically filter and show excerpt notes, memory cards, and related quiz questions generated from the currently active document. With a reference-based deck architecture, a card is no longer bound to a single deck: it can be reused by multiple decks, and you can freely dissolve and reorganize decks to optimize their composition. Weave presents reading documents, memory cards, and practice questions that you import or generate from Obsidian Markdown files through multiple data sources and multiple views, and supports batch management.

Weave also integrates with Anki via AnkiConnect. You can fetch decks and cards from Anki, or sync cards from Weave to Anki. Both import and export include necessary content format conversions to adapt to different editing and preview environments.

And Weave is far more than that. The in-plugin content editor uses Obsidian’s official editor, so you can use essentially all plugins and enhancements that apply to Obsidian’s editing scenarios. Weave can also link with Obsidian’s graph view, helping you understand where a reading document or memory card is positioned in your vault’s backlink network. The UI is built on top of Obsidian theme variables and is highly customizable, so you can apply any of the many available Obsidian themes to the plugin UI.

Likewise, Weave is far more than that. Based on the three interconnected core modules, features such as image masking, time dispersion, progressive cloze, curves, heatmaps, and workload charts can naturally emerge.

We look forward to your experience and support.

## Basic vs Advanced Features

| Module | Feature | Basic (Not Activated) | Advanced (Activated) | License Feature ID | Notes |
|---|---|---|---|---|---|
| Overview | Weave main view and core navigation | Available | Available | N/A | Primary entry point |
| Memory decks | Learning and review scheduling (FSRS6) | Available | Available | N/A | Core capability |
| Deck study | Deck study (Deck Study) | Available | Available | N/A | Core capability |
| Card management | Table view | Available | Available | N/A | Default view |
| Card management | Grid view | Not available | Available | `grid-view` | Falls back to table view and prompts activation when restricted |
| Card management | Kanban view | Not available | Available | `kanban-view` | Falls back to table view and prompts activation when restricted |
| Deck analytics | Per-deck analytics modal (curves, workload, etc.) | Not available | Available | `deck-analytics` | Main entry for analytics |
| Incremental reading | Incremental reading (IR annotation notes workflow) | Not available | Available | `incremental-reading` | Reading material management and incremental reading workflows |
| Question bank | Question bank / quizzes | Not available | Available | `question-bank` | Test sessions and performance tracking |
| Batch parsing | Batch parsing system | Not available | Available | `batch-parsing` | Automatic parsing, mapping, and triggers |
| AI | AI assistant | Not available or hidden | Available | `ai-assistant` | Depends on current implementation |
| Cloze | Progressive cloze | Not available | Available | `progressive-cloze` | Depends on feature entry points |
| Source tracing | View source / open source context | Available | Available | N/A | Fully free, no restrictions |

## Installation

### Option 1: Community plugins (not listed yet)

1. Open Obsidian settings
2. Go to Community plugins
3. Turn off Safe mode
4. Search for Weave
5. Install and enable

Notes:
- The community-store build only relies on `main.js`, `manifest.json`, and `styles.css`.
- `Legacy APKG import` is an optional enhanced capability. The community-store build does not ship the extra `sql-wasm.wasm` runtime by default.

### Option 2: Manual installation

1. Download the following files from the release package:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. If you need `Legacy APKG import`, also add:
   - `sql-wasm.wasm`
3. Copy them into:

   `.obsidian/plugins/weave/`

4. Restart Obsidian and enable the plugin

Additional notes:
- If you do not need legacy APKG import, the core three files are enough for the main plugin functionality.
- `versions.json` is repository metadata for version compatibility, not a runtime file required by the community-store installation flow.

## Quick Start

1. Open the Weave view
   - Use the ribbon icon or the command palette
2. Open settings
   - Configure data paths, decks, and feature toggles
3. Start with a closed loop
   - Import reading materials and create excerpts
   - Create memory cards from Markdown content
   - Start learning and reviewing
   - Generate quizzes from cards and start a test session

## Data Directories and Sync

The project divides data into two categories:

1. Vault data (recommended to sync across devices)
   - Data root: `weave/`
   - Includes memory (`weave/memory/`), incremental reading (`weave/incremental-reading/`), and question bank (`weave/question-bank/`) learning state and scheduling data

2. Plugin directory data (recommended to keep local, not synced)
   - Root directory: `.obsidian/plugins/weave/`
   - Includes configuration, indices, caches, logs, backups, and migration state

Incremental Reading can also output readable Markdown into a visible directory after processing (defaults to `weave/incremental-reading/IR`, configurable in settings).

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
