import { Client } from 'ssh2';
import { SSHConnectionConfig } from '../types/config.js';
import fs from 'fs/promises';

export class SSHConnection {
  private client: Client | null = null;
  private config: SSHConnectionConfig;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private commandTimeout: number;

  constructor(config: SSHConnectionConfig, commandTimeout = 60000) {
    this.config = config;
    this.commandTimeout = commandTimeout;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const idle = Date.now() - this.lastActivity;
    if (idle < 30 * 60 * 1000) {
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(() => {});
      }, 5000);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.client) {
      this.client.removeAllListeners();
      this.client.end();
    }

    this.client = new Client();
    const client = this.client;

    client
      .on('error', (err) => {
        console.error(`SSH error [${this.config.host}]: ${err.message}`);
        this.isConnected = false;
        this.scheduleReconnect();
      })
      .on('end', () => { this.isConnected = false; this.scheduleReconnect(); })
      .on('close', () => { this.isConnected = false; this.scheduleReconnect(); });

    const cfg: Record<string, unknown> = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      keepaliveInterval: this.config.keepaliveInterval || 10000,
      keepaliveCountMax: this.config.keepaliveCountMax || 3,
      readyTimeout: this.config.readyTimeout || 20000,
    };

    if (this.config.privateKeyPath) {
      cfg.privateKey = await fs.readFile(this.config.privateKeyPath, 'utf8');
    } else if (this.config.password) {
      cfg.password = this.config.password;
    } else {
      throw new Error('No auth method: need password or privateKeyPath');
    }

    return new Promise<void>((resolve, reject) => {
      const onReady = () => { cleanup(); this.isConnected = true; this.lastActivity = Date.now(); resolve(); };
      const onError = (err: Error) => { cleanup(); reject(err); };
      const cleanup = () => { client.removeListener('ready', onReady); client.removeListener('error', onError); };
      client.once('ready', onReady).once('error', onError).connect(cfg as any);
    });
  }

  async exec(command: string): Promise<{ output: string; exitCode: number }> {
    this.lastActivity = Date.now();
    if (!this.isConnected || !this.client) await this.connect();
    const client = this.client!;
    const timeout = this.commandTimeout;

    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let out = '', errOut = '';
        const timer = setTimeout(() => {
          stream.close();
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
        stream.on('data', (d: Buffer) => { out += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { errOut += d.toString(); });
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          this.lastActivity = Date.now();
          resolve({ output: out || errOut, exitCode: code || 0 });
        });
      });
    });
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.client) { this.client.removeAllListeners(); this.client.end(); this.client = null; }
    this.isConnected = false;
  }

  isActive() { return this.isConnected && this.client !== null; }
}

export class SSHConnectionPool {
  private connections = new Map<string, SSHConnection>();
  private commandTimeout: number;

  constructor(commandTimeout = 60000) { this.commandTimeout = commandTimeout; }

  async get(id: string, config: SSHConnectionConfig): Promise<SSHConnection> {
    let conn = this.connections.get(id);
    if (!conn) {
      conn = new SSHConnection(config, this.commandTimeout);
      this.connections.set(id, conn);
      await conn.connect();
    } else if (!conn.isActive()) {
      await conn.connect();
    }
    return conn;
  }

  async close(id: string) {
    const conn = this.connections.get(id);
    if (conn) { conn.disconnect(); this.connections.delete(id); }
  }

  closeAll() {
    for (const c of this.connections.values()) c.disconnect();
    this.connections.clear();
  }
}
