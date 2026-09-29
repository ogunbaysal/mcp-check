#!/usr/bin/env node
// A real HTTP MCP server exposing several endpoints for integration tests:
//   /mcp          Streamable HTTP, stateless, no auth required.
//   /mcp-auth     Streamable HTTP, stateless, requires "Authorization: Bearer test-token-12345".
//   /sse          SSE-only (the deprecated transport), no Streamable HTTP support at this
//                 path at all — POSTing here 404s, which is exactly the signal mcp-probe's
//                 client should use to fall back from Streamable HTTP to SSE.
//   /not-json     Returns a plain HTML body instead of an MCP response.
// Anything else 404s. Listens on process.env.PORT (use "0" for an OS-assigned
// free port) and prints "LISTENING:<port>" once ready, so tests never have to
// guess or hardcode a port.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "http-fixture-server", version: "1.0.0" });
  server.registerTool(
    "echo",
    {
      description: "Echoes the provided text back to the caller.",
      inputSchema: { text: z.string() },
    },
    ({ text }) => ({ content: [{ type: "text", text }] }),
  );
  server.registerResource(
    "readme",
    "file:///readme.txt",
    { description: "A short readme resource.", mimeType: "text/plain" },
    (uri) => ({ contents: [{ uri: uri.href, text: "hello", mimeType: "text/plain" }] }),
  );
  return server;
}

// The SDK's own stateless-mode example (`sessionIdGenerator: undefined`) and
// its accessor-based onclose/sessionId properties don't structurally satisfy
// its own declared types under `exactOptionalPropertyTypes` — a type-
// declaration looseness in the SDK itself, not a runtime issue. Narrow casts
// here are the pragmatic fix (same pattern as checks/http-initialization.ts).
function createStatelessTransport(): StreamableHTTPServerTransport {
  const options = { sessionIdGenerator: undefined } as unknown as ConstructorParameters<
    typeof StreamableHTTPServerTransport
  >[0];
  return new StreamableHTTPServerTransport(options);
}

async function connectServer(
  server: McpServer,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: this fixture exercises the SSE fallback path
  transport: StreamableHTTPServerTransport | SSEServerTransport,
): Promise<void> {
  await server.connect(transport as unknown as Transport);
}

// eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: this fixture exercises the SSE fallback path
const sseTransports = new Map<string, SSEServerTransport>();

const server = http.createServer((req, res) => {
  void handle(req, res);
});

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/mcp") {
    const transport = createStatelessTransport();
    await connectServer(buildMcpServer(), transport);
    await transport.handleRequest(req, res);
    return;
  }

  if (url.pathname === "/mcp-auth") {
    if (req.headers.authorization !== "Bearer test-token-12345") {
      res
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const transport = createStatelessTransport();
    await connectServer(buildMcpServer(), transport);
    await transport.handleRequest(req, res);
    return;
  }

  if (url.pathname === "/sse" && req.method === "GET") {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional: this fixture exercises the SSE fallback path
    const transport = new SSEServerTransport("/sse/messages", res);
    sseTransports.set(transport.sessionId, transport);
    transport.onclose = () => sseTransports.delete(transport.sessionId);
    await connectServer(buildMcpServer(), transport);
    return;
  }

  if (url.pathname === "/sse/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const transport = sseTransports.get(sessionId);
    if (!transport) {
      res.writeHead(400).end("unknown session");
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  if (url.pathname === "/not-json") {
    res.writeHead(200, { "content-type": "text/html" }).end("<html>not an mcp endpoint</html>");
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" }).end("not found");
}

const port = Number(process.env.PORT ?? "0");
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`LISTENING:${String(actualPort)}`);
});
