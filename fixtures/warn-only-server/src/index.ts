#!/usr/bin/env node
// A server that is otherwise perfectly valid except one tool has no
// description. This produces exactly one warning and zero errors, making it
// the right fixture to prove --strict escalates warnings to a failure while
// the default mode still passes.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "warn-only-fixture-server", version: "1.0.0" });

server.registerTool(
  "documented",
  { description: "This one is documented.", inputSchema: { value: z.string() } },
  ({ value }) => ({ content: [{ type: "text", text: value }] }),
);
server.registerTool("undocumented", { inputSchema: {} }, () => ({
  content: [{ type: "text", text: "ok" }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
