# Shiny - Extensible SPARQL Client

An Electron-based SPARQL client built with Vue 3 + TypeScript, featuring an advanced code editor, multi-backend support, comprehensive authentication, and a plugin system.

## Features

### Phase 1 (Current)
- ✅ Electron + Vue 3 + TypeScript foundation
- ✅ CodeMirror 6 editor integration
- ✅ Basic SPARQL query execution against generic endpoints
- ✅ Simple UI layout (TopBar, Sidebar, MainPane)
- ✅ Collapsible configuration sidebar

### Planned Features
- Multi-backend support (Generic SPARQL, Amazon Neptune, Stardog, Local RDF files)
- Advanced authentication (Basic, Bearer Token, OAuth 2.0, Custom Headers, AWS SigV4)
- SPARQL editor features (autocomplete, syntax validation, formatting)
- Results visualization (tables, charts, network graphs)
- Export capabilities (JSON, CSV, RDF formats, Markdown/HTML)
- Light/dark theme system
- Plugin system for extensibility

## Project Structure

```
shiny/
├── packages/
│   ├── main/         # Electron main process (Node.js)
│   ├── preload/      # Preload scripts (security bridge)
│   └── renderer/     # Vue 3 frontend application
├── scripts/          # Build and development scripts
└── plugins/          # User-installed plugins
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

1. Clone the repository and navigate to the project directory

2. Install dependencies:
```bash
npm install
```

This will install dependencies for all workspace packages.

### Development

Start the development server:
```bash
npm run dev
```

This will:
1. Compile TypeScript for main and preload processes (watch mode)
2. Start Vite dev server for the renderer process
3. Launch Electron with hot-reload

### Building

Build the application for production:
```bash
npm run build
```

## Architecture

### Security Model
- **Context Isolation**: Enabled - renderer process cannot access Node.js APIs directly
- **Node Integration**: Disabled - renderer runs in a sandboxed environment
- **IPC Bridge**: Secure preload script exposes limited API via `contextBridge`
- **Input Validation**: All IPC messages are validated in main process

### Technology Stack
- **Build Tool**: Vite (fast HMR, native ESM)
- **State Management**: Pinia (Vue 3 native, TypeScript support)
- **Code Editor**: CodeMirror 6 (lightweight, extensible)
- **HTTP Client**: Axios (auth interceptors, timeout handling)

## Development Roadmap

See the [Implementation Plan](/.claude/plans/linked-giggling-yeti.md) for detailed roadmap.

### Current Phase: Phase 1 - Foundation ✅
- Basic Electron + Vue 3 application
- Simple SPARQL query execution
- UI layout and structure

### Next: Phase 2 - Configuration & Authentication
- Multi-backend connection support
- Authentication providers
- Encrypted credential storage

## Contributing

This is currently a personal project. Contributions and feedback are welcome!

## License

MIT
