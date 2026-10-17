import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport } from '../src/lib/http-transport.js';

const savedPort = process.env.TANDOOR_MCP_HTTP_PORT;
const savedToken = process.env.TANDOOR_MCP_HTTP_TOKEN;

function initialize(id: number) {
  return {
    jsonrpc: '2.0', id, method: 'initialize',
    params: {
      protocolVersion: '2025-03-26', capabilities: {},
      clientInfo: { name: 'stateless-regression-test', version: '1.0.0' },
    },
  };
}

async function post(url: string, body: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

describe('stateless HTTP request lifecycle', () => {
  let handle: ReturnType<typeof createHttpTransport> | undefined;
  let url = '';
  let instances = 0;

  beforeEach(async () => {
    instances = 0;
    process.env.TANDOOR_MCP_HTTP_PORT = '0';
    delete process.env.TANDOOR_MCP_HTTP_TOKEN;
    handle = createHttpTransport(() => {
      instances++;
      const server = new McpServer({ name: 'test', version: '1' });
      // Registering a tool installs the SDK's tools/list handler.
      server.registerTool('regression_probe', {
        description: 'Read-only fixture',
        inputSchema: {},
      }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
      return server;
    });
    await handle.start();
    const address = handle.address();
    if (!address) throw new Error('server did not bind');
    url = 'http://127.0.0.1:' + address.port + '/mcp';
  });

  afterEach(async () => {
    await handle?.stop();
    handle = undefined;
    if (savedPort === undefined) delete process.env.TANDOOR_MCP_HTTP_PORT;
    else process.env.TANDOOR_MCP_HTTP_PORT = savedPort;
    if (savedToken === undefined) delete process.env.TANDOOR_MCP_HTTP_TOKEN;
    else process.env.TANDOOR_MCP_HTTP_TOKEN = savedToken;
  });

  it('handles repeated initialize and tools/list POSTs without 500s', async () => {
    const requests = [
      initialize(1),
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      initialize(3),
      { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} },
    ];
    for (const request of requests) {
      const response = await post(url, request);
      expect(response.status, response.text).toBe(200);
      expect(response.text).toContain('"jsonrpc":"2.0"');
      expect(response.text).toContain('"result"');
    }
    expect(instances).toBe(5);
  });

  it('handles simultaneous independent clients with separate transports', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => post(url, initialize(i + 1))));
    for (const response of responses) {
      expect(response.status, response.text).toBe(200);
      expect(response.text).toContain('"result"');
    }
    expect(instances).toBe(5);
  });
});
