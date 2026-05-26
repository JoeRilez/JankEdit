# JankEdit

A personal desktop IDE built from scratch. Electron + React + Monaco Editor, with a warm orange theme and pixel font UI.

## Features

- Syntax highlighting for C, C++, Java, Python and Kotlin
- Multi-tab editing with unsaved change indicators
- Native folder browser to open projects
- Custom orange colour scheme easy on the eyes
- Retro pixel font UI (Press Start 2P)
- Custom frameless window with minimize / maximize / close controls
- Ctrl+S to save

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [React](https://react.dev/) — UI
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the editor engine (same as VS Code)
- [Vite](https://vitejs.dev/) — bundler

## Getting Started

**Prerequisites:** Node.js v18+

```bash
git clone https://github.com/JoeRilez/JankEdit.git
cd JankEdit
npm install
```

Then start the dev server and Electron in two terminals:

```bash
# Terminal 1
npm run dev:vite

# Terminal 2
node node_modules/electron/dist/electron.exe .
```

## Roadmap

- [ ] LSP support (clangd, pyright, jdtls, kotlin-language-server)
- [ ] Proper settings panel (font size, theme tweaks)
- [ ] Integrated terminal
- [ ] Find & replace
- [ ] Packaged installer (.exe)
