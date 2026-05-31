import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import os from 'os';
import { ServerConfig } from '../types/config.js';

const ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isValidConnectionId(id: string): boolean {
  return ID_REGEX.test(id);
}

export const DEFAULT_CONFIG: ServerConfig = {
  ssh: {
    enabled: true,
    defaultTimeout: 60,
    maxConcurrentSessions: 10,
    keepaliveInterval: 5000,
    keepaliveCountMax: 3,
    readyTimeout: 30000,
    connections: {}
  },
  logging: {
    enabled: true,
    maxHistorySize: 1000
  }
};

function connectionsFromPrefixedEnv(): Record<string, any> {
  const acc: Record<string, any> = {};
  const re = /^SSH_(.+)_(HOST|PORT|USER|PASSWORD|KEY_B64|PASSPHRASE)$/;
  for (const [key, val] of Object.entries(process.env)) {
    if (!val) continue;
    const m = key.match(re);
    if (!m) continue;
    const id = m[1].toLowerCase();
    const field = m[2];
    const c = acc[id] ??= {};
    switch (field) {
      case 'HOST': c.host = val; break;
      case 'PORT': c.port = Number(val); break;
      case 'USER': c.username = val; break;
      case 'PASSWORD': c.password = val; break;
      case 'PASSPHRASE': c.passphrase = val; break;
      case 'KEY_B64': c.privateKey = Buffer.from(val, 'base64').toString('utf8'); break;
    }
  }
  for (const c of Object.values(acc)) if (c.port === undefined) c.port = 22;
  return acc;
}

export function loadConfigFromEnv(): ServerConfig {
  const raw = process.env.SSH_CONNECTIONS;
  let connections: Record<string, any>;
  if (raw) {
    try {
      connections = JSON.parse(raw);
    } catch (e) {
      throw new Error(`SSH_CONNECTIONS is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    connections = connectionsFromPrefixedEnv();
    if (Object.keys(connections).length === 0)
      throw new Error('No connections: set SSH_CONNECTIONS (JSON) or SSH_<ID>_HOST/_USER/... env vars');
  }
  const config: ServerConfig = {
    ssh: {
      ...DEFAULT_CONFIG.ssh,
      defaultTimeout: process.env.SSH_TIMEOUT ? Number(process.env.SSH_TIMEOUT) : DEFAULT_CONFIG.ssh.defaultTimeout,
      connections
    },
    logging: { ...DEFAULT_CONFIG.logging }
  };
  validateConfig(config);
  return config;
}

export function loadConfig(configPath?: string): ServerConfig {
  const locations = [
    configPath,
    path.join(process.cwd(), 'config.json'),
    path.join(os.homedir(), '.mcp-multi-ssh', 'config.json')
  ].filter(Boolean) as string[];

  let loaded: Partial<ServerConfig> = {};
  for (const loc of locations) {
    try {
      if (fs.existsSync(loc)) {
        loaded = JSON.parse(fs.readFileSync(loc, 'utf8'));
        console.error(`Loaded config from ${loc}`);
        break;
      }
    } catch (e) {
      console.error(`Error loading config from ${loc}:`, e);
    }
  }

  const config: ServerConfig = {
    ssh: { ...DEFAULT_CONFIG.ssh, ...loaded.ssh, connections: { ...loaded.ssh?.connections } },
    logging: { ...DEFAULT_CONFIG.logging, ...loaded.logging }
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: ServerConfig) {
  if (config.ssh.defaultTimeout < 1) throw new Error('defaultTimeout must be >= 1');
  if (config.ssh.maxConcurrentSessions < 1) throw new Error('maxConcurrentSessions must be >= 1');
  if (config.ssh.keepaliveInterval < 1000) throw new Error('keepaliveInterval must be >= 1000ms');
  if (config.ssh.readyTimeout < 1000) throw new Error('readyTimeout must be >= 1000ms');

  const invalid: string[] = [];
  for (const [id, conn] of Object.entries(config.ssh.connections)) {
    if (!isValidConnectionId(id)) {
      console.error(`Warning: Skipping '${id}': invalid ID (use alphanumeric, dots, hyphens, underscores)`);
      invalid.push(id);
      continue;
    }
    if (!conn.host || !conn.username || (!conn.password && !conn.privateKeyPath && !conn.privateKey)) {
      console.error(`Warning: Skipping invalid SSH connection '${id}': missing host, username, or auth`);
      invalid.push(id);
      continue;
    }
    if (conn.port && (conn.port < 1 || conn.port > 65535)) {
      console.error(`Warning: Skipping '${id}': invalid port`);
      invalid.push(id);
    }
  }
  for (const id of invalid) delete config.ssh.connections[id];
}

export function getConfigPath(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length - 1; i++) {
    if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) return path.resolve(args[i + 1]);
  }
  return path.join(os.homedir(), '.mcp-multi-ssh', 'config.json');
}

export async function saveConfig(config: ServerConfig) {
  const p = getConfigPath();
  const dir = path.dirname(p);
  await fsAsync.mkdir(dir, { recursive: true });
  await fsAsync.writeFile(p, JSON.stringify(config, null, 2));
}

export function createDefaultConfig(configPath: string) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
}
