# immich-mod

> **This is a fork, not the original Immich.** It is an unofficial, modified copy of
> [immich-app/immich](https://github.com/immich-app/immich) (forked from v3.2.4). It is not made, endorsed or
> supported by the Immich project or FUTO. Please do not report problems with this fork to upstream.

## What is different from upstream

- The web UI is replaced by a folder-centred gallery: every top-level folder below `/media` is shown as a "person" with an automatically chosen portrait (or one you pick with "Set as folder image").
- Subfolders are folded into their main folder by default; this can be changed globally in the settings and per folder.
- Loose media in the library root is grouped by recognised face and shown on the main page.
- PIN login with three strictness levels (PIN on every load, PIN once, or normal login), and an editable instance title.
- Sorting and filtering by date taken, date updated, name, file size and video length; images or videos first; favourites pinned to the top.
- Hover and touch-hold video previews, an info panel with recognised faces and text, and sturdier video playback.
- The upstream update notification is disabled.
- The original Immich settings pages are untouched and reachable through the Settings button.

## License

Immich is licensed under the [GNU Affero General Public License v3.0](LICENSE) and so is this fork. The original
copyright stays with the Immich contributors; modifications in this repository are released under the same AGPL-3.0
licence. If you run a modified version for other people over a network, you must offer them its source code.
