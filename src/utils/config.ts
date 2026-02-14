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
    if (!conn.host || !conn.username || (!conn.password && !conn.privateKeyPath)) {
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
