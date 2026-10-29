<img src="build/icon.png" alt="LightMD icon" width="128" align="right">

# LightMD

A lightweight Markdown viewer for the terminal, inspired by PyCharm's LightEdit mode. Run `lightmd notes.md` to see the file rendered in GitHub style. The view updates every time you save.

## Features

- Opens instantly from the terminal and gives your prompt back
- Live reload on save, keeping your scroll position
- Split view like PyCharm's: source only, source and preview, or preview only. The preview follows the source as you scroll
- GitHub styling with tables, task lists and code blocks, in light or dark mode
- A copy button on every code block
- Code blocks tagged ` ```markdown ` or ` ```md ` render as Markdown (tables, lists); other code stays code
- Drag and drop `.md` files onto the window
- One running app: each new file opens in its own window

## Install

Requires Node.js 22.12 or newer. Tested on macOS.

```sh
git clone https://github.com/jaygaha/lightmd.git
cd lightmd
npm install
```

## Usage

```sh
npm start -- path/to/file.md
```

To use `lightmd` from any folder, link it once:

```sh
npm link
lightmd README.md
```

### Open .md files from Finder (macOS)

```sh
npm run package
rm -rf /Applications/LightMD.app && cp -R dist/LightMD-darwin-*/LightMD.app /Applications/
```

Then select any `.md` file in Finder, press **⌘I**, set **Open with** to LightMD, and click **Change All…**

### Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + R` | Reload from disk |
| `Alt + Cmd/Ctrl + 1` / `2` / `3` | Source only / Source and preview / Preview only |
| `Cmd/Ctrl + +` / `-` / `0` | Zoom in / out / reset |
| `Cmd/Ctrl + W` | Close window |

## Development

```sh
npm test          # run the tests
npm run build     # rebuild the source pane bundle (runs automatically on install and start)
npm run icon      # rebuild the app icon from build/icon.svg
npm run package   # build LightMD.app (macOS)
```

```
main.js        app lifecycle, windows, file watching
preload.js     secure bridge between the window and the app
renderer.js    page logic: rendering, split view, drag and drop, copy buttons
src/           the read-only source pane (CodeMirror), bundled into vendor/
lib/           argument parsing, file loading, Markdown rendering, file watcher,
               scroll mapping (scroll-map.js also runs in the page, so keep it browser-safe)
bin/           the `lightmd` command
scripts/       build helpers: the source pane bundle and the app icon
vendor/        generated source pane bundle (gitignored; built on install and start)
test/          tests (node:test)
```

## License

[MIT](LICENSE) © 2026 [Jay Gaha](https://jaygaha.com.np)

Happy coding 🚀
