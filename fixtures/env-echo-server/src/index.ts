#!/usr/bin/env node
// Reports the value of MCP_CHECK_TEST_ENV_VALUE back as its serverInfo
// version, so integration tests can prove --env (or an inherited shell
// variable) actually reaches the spawned process, not just mcp-check's own.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "env-echo-fixture-server",
  version: process.env.MCP_CHECK_TEST_ENV_VALUE ?? "unset",
});

const transport = new StdioServerTransport();
await server.connect(transport);
