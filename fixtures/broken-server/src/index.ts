#!/usr/bin/env node
// A server that crashes immediately after starting, before it can complete
// the MCP initialize handshake. Simulates a server that dies on startup
// (e.g. a missing required environment variable or config file).
process.stderr.write("fatal: required configuration is missing\n");
process.exit(1);
