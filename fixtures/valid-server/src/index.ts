#!/usr/bin/env node
// A fully-correct MCP server: every tool/resource/prompt is valid, every
// tool has a description. Used to assert mcp-probe reports a clean PASS.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "valid-fixture-server", version: "1.2.0" });

server.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Echoes the provided text back to the caller.",
    inputSchema: { text: z.string().describe("Text to echo back") },
  },
  ({ text }) => ({ content: [{ type: "text", text }] }),
);

server.registerTool(
  "add",
  {
    title: "Add",
    description: "Adds two numbers together.",
    inputSchema: { a: z.number(), b: z.number() },
  },
  ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
);

server.registerResource(
  "readme",
  "file:///readme.txt",
  { title: "README", description: "A short readme resource.", mimeType: "text/plain" },
  (uri) => ({
    contents: [
      { uri: uri.href, text: "Hello from the valid fixture server.", mimeType: "text/plain" },
    ],
  }),
);

server.registerResource(
  "config",
  "config://app/settings.json",
  { title: "Config", description: "Application settings.", mimeType: "application/json" },
  (uri) => ({ contents: [{ uri: uri.href, text: "{}", mimeType: "application/json" }] }),
);

server.registerPrompt(
  "summarize",
  {
    title: "Summarize",
    description: "Summarizes the provided text.",
    argsSchema: { text: z.string().describe("Text to summarize") },
  },
  ({ text }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Summarize this: ${text}` } }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
