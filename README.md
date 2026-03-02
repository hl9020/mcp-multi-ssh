# mcp-multi-ssh

MCP server for managing and executing commands on multiple remote servers via SSH.

Built for use with [Claude Desktop](https://claude.ai/download) and other MCP-compatible clients.

## Features

- **Multi-host SSH** — configure and manage multiple server connections
- **Connection pooling** — automatic reconnect, keepalive, concurrent sessions
- **CRUD for connections** — create, read, update, delete connections at runtime
- **Auth validation** — requires password or private key, prevents invalid configs
- **Command history** — tracks executed commands with timestamps and exit codes
- **Password masking** — sensitive data never exposed in tool responses
- **Minimal footprint** — ~500 lines, SSH-only, no bloat

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
        "privateKeyPath": "/home/user/.ssh/id_rsa"
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
| `privateKeyPath` | one of | Path to private key file |
| `keepaliveInterval` | no | Override global keepalive (ms) |
| `keepaliveCountMax` | no | Override max failed keepalives |
| `readyTimeout` | no | Override connection timeout (ms) |

At least `password` or `privateKeyPath` must be provided.

## Background

This project started as a fork of [win-cli-mcp-server](https://github.com/SimonB97/win-cli-mcp-server) (now archived/deprecated). It has been rebuilt as a focused SSH-only MCP server — all Windows CLI functionality was removed, bugs were fixed, and the codebase was reduced by over 50%.

## License

MIT
