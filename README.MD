<img src="build/icon.png" alt="LightMD icon" width="128" align="right">

# LightMD

A lightweight Markdown viewer for the terminal, inspired by PyCharm's LightEdit mode. Run `lightmd notes.md` to see the file rendered in GitHub style. The view updates every time you save.

## Features

- Opens instantly from the terminal and gives your prompt back
- Live reload on save, keeping your scroll position
- GitHub styling with tables, task lists and code blocks, in light or dark mode
- A copy button on every code block
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
cp -R dist/LightMD-darwin-*/LightMD.app /Applications/
```

Then select any `.md` file in Finder, press **⌘I**, set **Open with** to LightMD, and click **Change All…**

### Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + R` | Reload from disk |
| `Cmd/Ctrl + +` / `-` / `0` | Zoom in / out / reset |
| `Cmd/Ctrl + W` | Close window |

## Development

```sh
npm test          # run the tests
npm run icon      # rebuild the app icon from build/icon.svg
npm run package   # build LightMD.app (macOS)
```

```
main.js        app lifecycle, windows, file watching
preload.js     secure bridge between the window and the app
renderer.js    page logic: rendering, drag and drop, copy buttons
lib/           argument parsing, file loading, Markdown rendering, file watcher
bin/           the `lightmd` command
test/          tests (node:test)
```

## License

[MIT](LICENSE) © 2026 [Jay Gaha](https://jaygaha.com.np)

Happy coding 🚀
