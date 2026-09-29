#!/usr/bin/env node
// A server that writes a plain-text banner to stdout before the MCP
// transport starts, corrupting the JSON-RPC stream. Real servers do this
// accidentally via console.log-style startup logging. mcp-probe should
// surface this as a specific, actionable hint rather than a bare parse error.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

console.log("Starting noisy-fixture-server v1.0.0...");

const server = new McpServer({ name: "noisy-fixture-server", version: "1.0.0" });
const transport = new StdioServerTransport();
await server.connect(transport);
