# MCP and live canvas

[Back to the README](../README.md) · [Data model](../ONTOLOGY.md)

Marmerlade includes a local MCP server and the built browser app. Your assistant
can edit the workspace while you follow the changes on the canvas.
Node.js 22.12 or newer is required.

## Build from source

From your checkout:

```bash
npm install
npm run build
node dist/cli.js --file ./architecture.marmerlade.json
```

The server prints its browser URL to stderr. Open that URL, or ask your assistant
to call `open_workspace`. The MCP connection uses stdin/stdout, so running the
command in a terminal alone does not register it with an assistant.

## Connect an assistant

Use absolute paths for both the built CLI and workspace file because client
working directories vary. Replace the paths below with your own, and merge the
entry into any existing configuration. Stop any terminal instance using the same
workspace file before connecting the assistant.

### Kiro

Add this to `.kiro/settings/mcp.json` in your workspace, or
`~/.kiro/settings/mcp.json` for all workspaces:

```json
{
  "mcpServers": {
    "marmerlade": {
      "command": "node",
      "args": [
        "/absolute/path/to/marmerlade/dist/cli.js",
        "--file",
        "/absolute/path/architecture.marmerlade.json"
      ],
      "disabled": false
    }
  }
}
```

Save the file. Kiro reconnects automatically when the configuration changes.
You can open the workspace file through the command palette with
**Kiro: Open workspace MCP config (JSON)**.
See [Kiro's MCP configuration guide](https://kiro.dev/docs/mcp/configuration/).

### Codex

Add this to `~/.codex/config.toml`, or `.codex/config.toml` in a trusted project:

```toml
[mcp_servers.marmerlade]
command = "node"
args = [
  "/absolute/path/to/marmerlade/dist/cli.js",
  "--file",
  "/absolute/path/architecture.marmerlade.json"
]
```

Alternatively, register the server with the CLI:

```bash
codex mcp add marmerlade -- node /absolute/path/to/marmerlade/dist/cli.js --file /absolute/path/architecture.marmerlade.json
```

Use `codex mcp list` to check registration and `/mcp` in a Codex session to
inspect active servers. The CLI and IDE extension share the configuration.
See [Codex's MCP guide](https://developers.openai.com/codex/mcp/).

### Other clients

For clients using `mcpServers` JSON, such as Claude Desktop and Cursor:

```json
{
  "mcpServers": {
    "marmerlade": {
      "command": "node",
      "args": [
        "/absolute/path/to/marmerlade/dist/cli.js",
        "--file",
        "/absolute/path/architecture.marmerlade.json"
      ]
    }
  }
}
```

Restart the MCP connection after changing its configuration. Client configuration
is never modified automatically by Marmerlade.

### Check the connection

Ask your assistant to call `get_workspace`, then `open_workspace`. The first
returns the document and revision; the second opens the live browser canvas.
Edits through MCP update the browser and save to the workspace JSON file.

### After the npm release

Once the package is published, you can start it with:

```bash
npx -y marmerlade --file ./architecture.marmerlade.json
```

In your client configuration, use `"npx"` as the command and
`["-y", "marmerlade", "--file", "/absolute/path/architecture.marmerlade.json"]`
as the arguments.

## Tools and resources

- `get_workspace` returns the complete document, revision, file path and canvas URL.
- `apply_changes` takes the revision and an atomic `changes` array. Operations are
  `put_node`, `put_edge`, `put_page`, `put_deck`, `delete_node`, `delete_edge`,
  `delete_page`, and `delete_deck`. Put operations replace the entity by ID.
  Document puts take `{id, title, body}`; the server sets `updatedAt`.
- `import_mermaid` takes `revision`, `source`, and optional `tidy` (default true).
  It replaces diagram structure while preserving existing document content and
  surviving nodes' styling. New page/deck references create empty documents.
- `export_mermaid` returns structure as Mermaid. JSON preserves all content.
- `open_workspace` accepts `view` (`canvas`, `node`, `wiki`, `slides`) and an optional
  `id` to open a particular item. `node` requires an ID.
- `marmerlade://guide` describes the model and Markdown syntax;
  `marmerlade://example` contains a complete linked example.

Read `get_workspace` before editing and pass its revision to the edit tool.
All operations in a batch are validated together. Deleting a node removes its
subtree and incident edges, retaining wiki pages and decks. Deleting a document
unlinks it from all nodes. Parent cycles and missing references are rejected.

## Saving and recovery

Without `--file`, the server uses `./diagram.marmerlade.json` in its working
directory. One process owns each workspace file; a second writer is rejected.
The file is created on the first successful edit and saved atomically as version 3.
Existing version 1–3 files and bare diagram JSON are accepted. Do not edit the file
externally while the server owns it. Stop the server first. Locks from a crashed
process expire automatically after the lock heartbeat becomes stale.

Canvas, wiki and slide windows follow the same server workspace. Remote updates
reset the browser's diagram undo history so undo cannot revive stale state.
Conflicting edits are rejected; the browser retains its draft and offers
**Download draft** and **Reload latest**. A disconnected window also keeps its
unsaved draft and reconnects automatically. Download it before discarding or
reloading the window. Browser requests are limited to 20 MiB, including images.

The regular `npm run dev` app continues to save to browser localStorage. That
storage is separate from MCP workspaces. Export a `.marmerlade.json` and pass its
path with `--file` to bring an existing browser document into the live workspace.

See [development](development.md) for checks and package verification.
