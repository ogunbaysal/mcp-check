#!/usr/bin/env node
// A server that delays connecting its transport, so the MCP initialize
// handshake never completes within a short --timeout. The delay is
// configurable via SLOW_SERVER_DELAY_MS so tests can pick a value far
// longer than the timeout they exercise, keeping the test deterministic.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const delayMs = Number(process.env.SLOW_SERVER_DELAY_MS ?? "60000");

const server = new McpServer({ name: "slow-fixture-server", version: "1.0.0" });

await new Promise((resolve) => setTimeout(resolve, delayMs));

const transport = new StdioServerTransport();
await server.connect(transport);
