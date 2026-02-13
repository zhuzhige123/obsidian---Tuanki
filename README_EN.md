# Weave (Tuanki)

<div align="center">

![Tuanki](https://img.shields.io/badge/Tuanki-Weave-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.7.3.1-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-purple?style=for-the-badge)

</div>

Tuanki is a learning workflow plugin built specifically for Obsidian. The main in-plugin UI view is called Weave.

Weave connects three stages into one traceable, verifiable, and reviewable learning loop:

- Reading decks: reading material management and incremental reading workflows
- Memory decks: subjective memorization and review scheduling based on FSRS6
- Question decks: generate quizzes from memory cards and track objective performance (including EWMA trend tracking)

In this loop, your excerpt notes, memory cards, and quiz questions can all be located via block references and backlinks, making everything traceable and interconnected.

Minimum supported Obsidian version: 0.15.0

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
4. Search for Tuanki
5. Install and enable

### Option 2: Manual installation

1. Download the following files from the release package:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `sql-wasm.wasm` (if included in the release)
   - `versions.json` (if included in the release)
2. Copy them into:

   `.obsidian/plugins/tuanki/`

3. Restart Obsidian and enable the plugin

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
   - Machine-readable data root: `.tuanki/`
   - Includes learning state and scheduling state for memory, incremental reading, and question bank modules

2. Plugin directory data (recommended to keep local, not synced)
   - Root directory: `.obsidian/plugins/tuanki/`
   - Includes configuration, indices, caches, logs, backups, and migration state

Incremental Reading can also output readable Markdown into a visible directory after processing (defaults to `tuanki/IR`, configurable in settings).

## License

This project includes an MIT `LICENSE` file.

Some capabilities may be controlled by configuration or licensing flow in different releases.

Support and feedback:

- Email: tutaoyuan8@outlook.com
- Issues: https://github.com/zhuzhige123/obsidian---Tuanki/issues

## Development

```bash
npm install
npm run dev
```

Note: development mode uses the Vite watch build flow.

## More Documentation

- Installation and testing: `INSTALLATION.md`
- Release guide: `docs/RELEASE_GUIDE.md`
- Image masking: `docs/IMAGE_MASK_GUIDE.md`
