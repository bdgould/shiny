# Shiny - SPARQL Client

A modern, user-friendly SPARQL client with a VS Code-style interface. Query knowledge graphs, manage multiple endpoints, and export results in various formats.

![Shiny - SPARQL Client](docs/shiny.png)

## What is Shiny?

Shiny is a desktop application for querying SPARQL endpoints—the standard way to retrieve data from knowledge graphs and linked data sources. Whether you're exploring public datasets like DBpedia or working with enterprise graph databases, Shiny provides a clean, intuitive interface for writing queries and analyzing results.

## Installation

Download the latest release for your platform from [GitHub Releases](https://github.com/bdgould/shiny/releases).

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `Shiny-x.x.x-arm64.dmg` |
| macOS (Intel) | `Shiny-x.x.x-x64.dmg` |
| Windows | `Shiny Setup x.x.x-x64.exe` |
| Linux | `Shiny-x.x.x.AppImage` |

### macOS Installation

1. Download and open the `.dmg` file
2. Drag Shiny to your Applications folder
3. **Before first launch**, open Terminal and run:
   ```bash
   xattr -d com.apple.quarantine /Applications/Shiny.app
   ```
  * This is due to the app being not code-signed with an Apple Developer ID...
4. Now you can open Shiny normally

> **Why is this needed?** Shiny is not code-signed with an Apple Developer ID. macOS quarantines unsigned apps downloaded from the internet. The command above removes this restriction.

### Windows Installation

1. Download and run the `.exe` installer
2. Follow the installation wizard
3. Launch Shiny from the Start menu

### Linux Installation

1. Download the `.AppImage` file
2. Make it executable: `chmod +x Shiny-x.x.x.AppImage`
3. Run the AppImage

## Features

**Multi-Backend Support**
- Connect to multiple SPARQL endpoints simultaneously
- Switch between backends with a dropdown selector
- Supports Generic SPARQL 1.1, Altair Graph Studio, Mobi, and Ontotext GraphDB

**Secure Authentication**
- Basic Auth, Bearer Token, and Custom Headers
- Credentials encrypted using your operating system's secure storage (Keychain on macOS, DPAPI on Windows)

**Modern Query Editor**
- Syntax highlighting and formatting
- Multi-tab interface with session persistence
- Keyboard shortcuts for efficient workflow

**Query History**
- Browse and search past queries
- Replay queries with a single click
- History persists across sessions

**AI-Assisted Queries**
- Chat interface for query assistance
- Natural language to SPARQL conversion

**Flexible Results**
- Table view with sorting and filtering
- Entity view for exploring individual resources
- Export to JSON, CSV, Turtle, N-Triples, N-Quads, and JSON-LD

## Getting Started

### First Launch

When you first open Shiny, a sample connection to DBpedia (a public knowledge graph) is already configured. You can immediately run a query to test it out.

### Running Your First Query

1. Make sure "dbpedia" is selected in the backend dropdown (top of the editor)
2. Try this sample query:
   ```sparql
   SELECT ?person ?name WHERE {
     ?person a <http://dbpedia.org/ontology/Scientist> ;
             <http://xmlns.com/foaf/0.1/name> ?name .
   } LIMIT 10
   ```
3. Press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Windows/Linux) to execute
4. View results in the panel below

### Adding a New Backend

1. Click the connection icon in the left sidebar
2. Click **+ Add Backend**
3. Enter a name, select the backend type, and provide the endpoint URL
4. Choose an authentication method and enter credentials if needed
5. Click **Test Connection** to verify, then **Create**

## Usage Guide

### Managing Connections

- **Switch backends**: Use the dropdown in the top bar
- **Test connection**: Click the plug icon on any backend card
- **Edit**: Click the pencil icon
- **Delete**: Click the trash icon (confirmation required)

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Execute query | Cmd+Enter | Ctrl+Enter |
| Close tab | Cmd+W | Ctrl+W |
| Save file | Cmd+S | Ctrl+S |
| Open file | Cmd+O | Ctrl+O |

### Working with Results

**Table View**: Sort columns by clicking headers. Copy cells or rows to clipboard.

**Entity View**: Click any URI in results to explore that resource's properties.

**Export Options**:
- Click the export button above results
- Choose format: JSON, CSV, or RDF formats (Turtle, N-Triples, N-Quads, JSON-LD)
- Files are saved to your Downloads folder

### File Operations

- **Open**: Drag `.rq` or `.sparql` files onto Shiny, or use Cmd/Ctrl+O
- **Save**: Cmd/Ctrl+S saves the current query to a file

## Troubleshooting

### Connection Errors

**"Network error" or timeout**: Verify the endpoint URL is correct and accessible from your network. Some endpoints require VPN access.

**"401 Unauthorized"**: Check your username and password. For Bearer Token auth, ensure the token hasn't expired.

### Credential Storage Issues (Linux)

If credentials aren't being saved on Linux, install `libsecret`:

```bash
# Debian/Ubuntu
sudo apt-get install libsecret-1-dev

# Fedora
sudo dnf install libsecret-devel
```

### App Won't Open (macOS)

If you see "Shiny is damaged" or similar:

```bash
xattr -d com.apple.quarantine /Applications/Shiny.app
```

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/bdgould/shiny/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bdgould/shiny/discussions)

## License

MIT License - see [LICENSE](LICENSE) for details.
