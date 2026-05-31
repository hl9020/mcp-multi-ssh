#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, createDefaultConfig } from './utils/config.js';
import { MCPSSHServer } from './server.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const parseArgs = async () => yargs(hideBin(process.argv))
  .option('config', { alias: 'c', type: 'string', description: 'Path to config file' })
  .option('init-config', { type: 'string', description: 'Create default config at path' })
  .help().parse();

const main = async () => {
  try {
    const args = await parseArgs();
    if (args['init-config']) { createDefaultConfig(args['init-config'] as string); console.error(`Config created: ${args['init-config']}`); process.exit(0); }
    const config = loadConfig(args.config);
    const mcp = new MCPSSHServer(config);
    const transport = new StdioServerTransport();
    process.on('SIGINT', () => { mcp.closePool(); process.exit(0); });
    await mcp.server.connect(transport);
    console.error("mcp-multi-ssh running on stdio");
  } catch (e) {
    console.error("Fatal:", e);
    process.exit(1);
  }
};

main();
