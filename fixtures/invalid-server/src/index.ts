#!/usr/bin/env node
// A server that completes the MCP handshake successfully, but whose
// capabilities have real, detectable problems: a tool with no description
// (warning), duplicate tool names (failure), and a duplicate resource URI
// (failure). Registered directly against the low-level Server so we can
// force protocol-shape issues that the high-level McpServer API guards
// against (like two tools sharing a name).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  CallToolRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// The low-level Server API is intentionally used here (McpServer.registerTool
// rejects duplicate tool names outright, which would defeat the purpose of
// this fixture).
// eslint-disable-next-line @typescript-eslint/no-deprecated
const server = new Server(
  { name: "invalid-fixture-server", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "documented-tool",
      description: "This tool has a proper description.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "undocumented-tool",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "duplicate-tool",
      description: "First of two tools sharing a name.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "duplicate-tool",
      description: "Second of two tools sharing a name.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, () => ({
  content: [{ type: "text", text: "ok" }],
}));

server.setRequestHandler(ListResourcesRequestSchema, () => ({
  resources: [
    { uri: "file:///a.txt", name: "a" },
    { uri: "file:///b.txt", name: "b" },
    { uri: "file:///b.txt", name: "b-duplicate" },
  ],
}));
server.setRequestHandler(ReadResourceRequestSchema, () => ({
  contents: [{ uri: "file:///a.txt", text: "content" }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
