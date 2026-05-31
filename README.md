# mcp-multi-ssh

MCP server for managing and executing commands on multiple remote servers via SSH.

Built for use with [Claude Desktop](https://claude.ai/download) and other MCP-compatible clients.

## Features

- **Multi-host SSH** - configure and manage multiple server connections
- **Connection pooling** - automatic reconnect, keepalive, concurrent sessions
- **CRUD for connections** - create, read, update, delete connections at runtime
- **Auth validation** - requires password or private key, prevents invalid configs
- **Command history** - tracks executed commands with timestamps and exit codes
- **Password masking** - sensitive data never exposed in tool responses
- **Minimal footprint** - ~500 lines, SSH-only, no bloat

## Installation

### Claude Desktop / Claude.ai

Add to `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-multi-ssh": {
      "command": "npx",
      "args": ["-y", "mcp-multi-ssh"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mcp-multi-ssh -- npx -y mcp-multi-ssh
```

Or add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "mcp-multi-ssh": {
      "command": "npx",
      "args": ["-y", "mcp-multi-ssh"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "mcp-multi-ssh": {
      "command": "npx",
      "args": ["-y", "mcp-multi-ssh"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`. Same JSON format as above.

### VS Code + GitHub Copilot

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "mcp-multi-ssh": {
      "command": "npx",
      "args": ["-y", "mcp-multi-ssh"]
    }
  }
}
```

### Cline

Open Cline -> MCP Servers icon -> Edit MCP Settings, then add the same JSON as Claude Desktop.

### OpenAI Codex CLI

```bash
codex mcp add mcp-multi-ssh -- npx -y mcp-multi-ssh
```

### Zed

Add to Zed `settings.json` (via Agent Panel -> Settings):

```json
{
  "context_servers": {
    "mcp-multi-ssh": {
      "command": {
        "path": "npx",
        "args": ["-y", "mcp-multi-ssh"]
      }
    }
  }
}
```

### Compatibility Matrix

| Tool | Config Location |
|------|----------------|
| Claude Desktop / Claude.ai | `claude_desktop_config.json` |
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code + Copilot | `.vscode/mcp.json` |
| Cline | MCP Settings JSON |
| Continue.dev | `.continue/mcpServers/*.json` |
| Zed | `settings.json` |
| Codex CLI | `.codex/config.toml` |
| Roo Code | MCP Settings JSON |
| Google Antigravity | `~/.gemini/settings.json` |

### Local install

```bash
npm install -g mcp-multi-ssh
```

Then in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-multi-ssh": {
      "command": "mcp-multi-ssh"
    }
  }
}
```

## Configuration

Config file is loaded from (in order):

1. Path specified via `--config` flag
2. `./config.json` in current directory
3. `~/.mcp-multi-ssh/config.json`

### Example config

```json
{
  "ssh": {
    "enabled": true,
    "defaultTimeout": 60,
    "maxConcurrentSessions": 10,
    "keepaliveInterval": 5000,
    "keepaliveCountMax": 3,
    "readyTimeout": 30000,
    "connections": {
      "my-server": {
        "host": "example.com",
        "port": 22,
        "username": "deploy",
        "privateKeyPath": "/home/user/.ssh/id_rsa",
        "passphrase": "key-passphrase-if-encrypted"
      },
      "db-server": {
        "host": "10.0.0.5",
        "port": 22,
        "username": "admin",
        "password": "secret"
      }
    }
  },
  "logging": {
    "enabled": true,
    "maxHistorySize": 1000
  }
}
```

To generate a default config:

```bash
npx mcp-multi-ssh --init-config ~/.mcp-multi-ssh/config.json
```

## Remote HTTP Server (Docker / Dokploy)

In addition to stdio, the server can run as a remote MCP over Streamable HTTP - reachable as a custom connector from Claude web/mobile. Start it with `npm run start:http` (or `node dist/http.js`), or build the included `Dockerfile`.

In HTTP mode the connection config comes from environment variables (not a config file), and the write tools (`create`/`update`/`delete_ssh_connection`) are disabled - the server is read/execute only.

### Environment variables

| Var | Required | Description |
|---|---|---|
| `MCP_AUTH_TOKEN` | yes | Bearer token clients must send in the `Authorization` header |
| `PORT` | no | Listen port (default 3000) |
| `MCP_PATH` | no | Endpoint path (default `/mcp`) |
| `MCP_ENABLED` | no | Set to `false` to refuse startup (kill switch) |
| `SSH_TIMEOUT` | no | Command timeout in seconds (default 60) |
| `SSH_CONNECTIONS` | one of | All connections as a single JSON object (format A) |
| `SSH_<ID>_*` | one of | Per-server vars (format B, see below) |

If `SSH_CONNECTIONS` is set it takes precedence; otherwise the `SSH_<ID>_*` vars are collected.

**Format A** - one JSON var:

```
SSH_CONNECTIONS={"web1":{"host":"1.2.3.4","port":22,"username":"root","password":"secret"}}
```

**Format B** - per-server vars, no JSON escaping. The middle segment becomes the (lowercased) connection ID, so `SSH_WEB1_HOST` -> connection `web1`:

```
SSH_WEB1_HOST=1.2.3.4
SSH_WEB1_PORT=22          # optional, defaults to 22
SSH_WEB1_USER=root
SSH_WEB1_PASSWORD=secret  # or SSH_WEB1_KEY_B64
```

For key auth, base64-encode the OpenSSH key file (avoids newline escaping) and pass it as `SSH_<ID>_KEY_B64`, with optional `SSH_<ID>_PASSPHRASE`. The helper script does the encoding on any platform with Node:

```bash
node tools/key2env.mjs /path/to/id_ed25519 web1
```

### Auth

Clients authenticate with a bearer token. The endpoint returns `401` without a valid `Authorization: Bearer <MCP_AUTH_TOKEN>` header. A `GET /health` endpoint (no auth) reports status and connection count. Since the endpoint is public, pair the token with a network allowlist (e.g. restrict to your MCP client's egress ranges) and a least-privilege SSH user where possible.

## Tools

| Tool | Description |
|---|---|
| `ssh_execute` | Execute a command on a remote host |
| `ssh_disconnect` | Close an SSH connection |
| `create_ssh_connection` | Add a new connection to config |
| `read_ssh_connections` | List all configured connections |
| `update_ssh_connection` | Modify an existing connection |
| `delete_ssh_connection` | Remove a connection from config |
| `get_command_history` | View recent SSH command history |

## Connection Config

Each connection requires:

| Field | Required | Description |
|---|---|---|
| `host` | yes | Hostname or IP address |
| `port` | yes | SSH port |
| `username` | yes | SSH username |
| `password` | one of | Password authentication |
| `privateKeyPath` | one of | Path to private key file (OpenSSH/PEM format) |
| `privateKey` | one of | Private key content directly (OpenSSH/PEM); used by HTTP mode |
| `passphrase` | no | Passphrase for an encrypted private key |
| `keepaliveInterval` | no | Override global keepalive (ms) |
| `keepaliveCountMax` | no | Override max failed keepalives |
| `readyTimeout` | no | Override connection timeout (ms) |

At least `password` or `privateKeyPath` must be provided.

Private keys must be in OpenSSH/PEM format. PuTTY `.ppk` files are not supported - convert them first via PuTTYgen (`Conversions -> Export OpenSSH key`).

## Background

This project started as a fork of [win-cli-mcp-server](https://github.com/SimonB97/win-cli-mcp-server) (now archived/deprecated). It has been rebuilt as a focused SSH-only MCP server - all Windows CLI functionality was removed, bugs were fixed, and the codebase was reduced by over 50%.

## License

MIT

