#!/usr/bin/env node
// A minimal, spec-valid MCP server: no tools, resources, or prompts at all.
// mcp-probe must not fail just because these capabilities are absent.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "minimal-fixture-server", version: "0.1.0" });

const transport = new StdioServerTransport();
await server.connect(transport);
