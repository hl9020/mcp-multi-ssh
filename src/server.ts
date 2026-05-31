import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { saveConfig, isValidConnectionId } from './utils/config.js';
import type { ServerConfig, CommandHistoryEntry } from './types/config.js';
import { SSHConnectionPool } from './utils/ssh.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const WRITE_TOOLS = new Set(['create_ssh_connection', 'update_ssh_connection', 'delete_ssh_connection']);

export class MCPSSHServer {
  readonly server: Server;
  private config: ServerConfig;
  private pool: SSHConnectionPool;
  private history: CommandHistoryEntry[] = [];
  private readonly: boolean;

  constructor(config: ServerConfig, opts: { readonly?: boolean } = {}) {
    this.config = config;
    this.readonly = opts.readonly ?? false;
    this.pool = new SSHConnectionPool(config.ssh.defaultTimeout * 1000);
    this.server = new Server(
      { name: "mcp-multi-ssh", version: pkg.version },
      { capabilities: { tools: { listChanged: true } } }
    );
    this.setup();
  }

  private log(entry: Omit<CommandHistoryEntry, 'timestamp'>) {
    if (!this.config.logging.enabled) return;
    this.history.push({ ...entry, timestamp: new Date().toISOString() });
    if (this.history.length > this.config.logging.maxHistorySize)
      this.history = this.history.slice(-this.config.logging.maxHistorySize);
  }

  closePool() { this.pool.closeAll(); }

  private toolsChangedTimer?: ReturnType<typeof setTimeout>;
  private notifyToolsChanged(debounceMs = 500) {
    if (this.toolsChangedTimer) clearTimeout(this.toolsChangedTimer);
    this.toolsChangedTimer = setTimeout(() => {
      this.server.sendToolListChanged().catch(() => {});
    }, debounceMs);
  }

  private setup() {
    const allTools = [
      {
        name: "ssh_execute",
        description: "Execute a command on a remote host via SSH. connectionId accepts ANY configured connection (not just the first one); call read_ssh_connections to list all available connection IDs.",
        inputSchema: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "SSH connection ID. Any configured connection is valid; the enum lists all available IDs. Use read_ssh_connections to see them.", enum: Object.keys(this.config.ssh.connections) },
            command: { type: "string", description: "Command to execute" }
          },
          required: ["connectionId", "command"]
        }
      },
      {
        name: "ssh_disconnect",
        description: "Disconnect an SSH session",
        inputSchema: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "SSH connection ID", enum: Object.keys(this.config.ssh.connections) }
          },
          required: ["connectionId"]
        }
      },
      {
        name: "create_ssh_connection",
        description: "Create a new SSH connection in config",
        inputSchema: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "ID for the connection (alphanumeric, dots, hyphens, underscores)" },
            connectionConfig: {
              type: "object",
              properties: {
                host: { type: "string" }, port: { type: "number" }, username: { type: "string" },
                password: { type: "string" }, privateKeyPath: { type: "string" }
              },
              required: ["host", "port", "username"]
            }
          },
          required: ["connectionId", "connectionConfig"]
        }
      },
      {
        name: "read_ssh_connections",
        description: "List all configured SSH connections",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "update_ssh_connection",
        description: "Update an existing SSH connection",
        inputSchema: {
          type: "object",
          properties: {
            connectionId: { type: "string" },
            connectionConfig: {
              type: "object",
              properties: {
                host: { type: "string" }, port: { type: "number" }, username: { type: "string" },
                password: { type: "string" }, privateKeyPath: { type: "string" }
              }
            }
          },
          required: ["connectionId", "connectionConfig"]
        }
      },
      {
        name: "delete_ssh_connection",
        description: "Delete an SSH connection from config",
        inputSchema: {
          type: "object",
          properties: { connectionId: { type: "string" } },
          required: ["connectionId"]
        }
      },
      {
        name: "get_command_history",
        description: "Get SSH command history",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number", description: "Max entries (default 10)" } }
        }
      }
    ];

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.readonly ? allTools.filter(t => !WRITE_TOOLS.has(t.name)) : allTools
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      if (this.readonly && WRITE_TOOLS.has(req.params.name))
        throw new McpError(ErrorCode.MethodNotFound, `Tool '${req.params.name}' disabled in readonly mode`);
      try {
        switch (req.params.name) {
          case "ssh_execute": {
            const { connectionId, command } = z.object({
              connectionId: z.string(), command: z.string()
            }).parse(req.params.arguments);

            const connCfg = this.config.ssh.connections[connectionId];
            if (!connCfg) throw new McpError(ErrorCode.InvalidRequest, `Unknown connection: ${connectionId}. Available: ${Object.keys(this.config.ssh.connections).join(', ')}`);

            try {
              const conn = await this.pool.get(connectionId, connCfg);
              const { output, exitCode } = await conn.exec(command);
              this.log({ command, output, exitCode, connectionId });
              return {
                content: [{ type: "text", text: output || 'Command completed (no output)' }],
                isError: exitCode !== 0
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.log({ command, output: `SSH error: ${msg}`, exitCode: -1, connectionId });
              throw new McpError(ErrorCode.InternalError, `SSH error: ${msg}`);
            }
          }

          case "ssh_disconnect": {
            const { connectionId } = z.object({ connectionId: z.string() }).parse(req.params.arguments);
            await this.pool.close(connectionId);
            return { content: [{ type: "text", text: `Disconnected from ${connectionId}` }] };
          }

          case "create_ssh_connection": {
            const { connectionId, connectionConfig } = z.object({
              connectionId: z.string(),
              connectionConfig: z.object({
                host: z.string(), port: z.number(), username: z.string(),
                password: z.string().optional(), privateKeyPath: z.string().optional(),
              }).refine(d => d.password || d.privateKeyPath, { message: 'Need password or privateKeyPath' })
            }).parse(req.params.arguments);
            if (!isValidConnectionId(connectionId))
              throw new McpError(ErrorCode.InvalidParams, `Invalid connection ID: use alphanumeric, dots, hyphens, underscores (max 64 chars)`);
            if (this.config.ssh.connections[connectionId])
              throw new McpError(ErrorCode.InvalidRequest, `Connection '${connectionId}' already exists`);
            this.config.ssh.connections[connectionId] = connectionConfig;
            await saveConfig(this.config);
            this.notifyToolsChanged();
            return { content: [{ type: "text", text: `Connection '${connectionId}' created.` }] };
          }

          case "read_ssh_connections": {
            const mask = (v?: string) => v ? '********' : undefined;
            const safe = Object.fromEntries(
              Object.entries(this.config.ssh.connections).map(([id, c]) => [id, {
                ...c,
                password: mask(c.password),
                privateKey: mask(c.privateKey),
                passphrase: mask(c.passphrase),
              }])
            );
            return { content: [{ type: "text", text: JSON.stringify(safe, null, 2) }] };
          }

          case "update_ssh_connection": {
            const { connectionId, connectionConfig } = z.object({
              connectionId: z.string(),
              connectionConfig: z.object({
                host: z.string(), port: z.number(), username: z.string(),
                password: z.string().optional(), privateKeyPath: z.string().optional(),
              }).refine(d => d.password || d.privateKeyPath, { message: 'Need password or privateKeyPath' })
            }).parse(req.params.arguments);
            if (!this.config.ssh.connections[connectionId])
              throw new McpError(ErrorCode.InvalidRequest, `Connection '${connectionId}' not found`);
            await this.pool.close(connectionId);
            this.config.ssh.connections[connectionId] = connectionConfig;
            await saveConfig(this.config);
            this.notifyToolsChanged();
            return { content: [{ type: "text", text: `Connection '${connectionId}' updated.` }] };
          }

          case "delete_ssh_connection": {
            const { connectionId } = z.object({ connectionId: z.string() }).parse(req.params.arguments);
            if (!this.config.ssh.connections[connectionId])
              throw new McpError(ErrorCode.InvalidRequest, `Connection '${connectionId}' not found`);
            await this.pool.close(connectionId);
            delete this.config.ssh.connections[connectionId];
            await saveConfig(this.config);
            this.notifyToolsChanged();
            return { content: [{ type: "text", text: `Connection '${connectionId}' deleted.` }] };
          }

          case "get_command_history": {
            const { limit } = z.object({ limit: z.number().min(1).max(500).optional().default(10) }).parse(req.params.arguments);
            return { content: [{ type: "text", text: JSON.stringify(this.history.slice(-limit), null, 2) }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${req.params.name}`);
        }
      } catch (e) {
        if (e instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid args: ${e.issues.map((x: any) => x.message).join(', ')}`);
        throw e;
      }
    });
  }
}
