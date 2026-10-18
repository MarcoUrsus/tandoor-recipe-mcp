import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PantryClient } from '../src/clients/pantry.js';
import { registerPantryTools, createPantryEntryShape, updatePantryEntryShape } from '../src/tools/pantry.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { CORE_TOOLS, findToolGroup } from '../src/lib/tool-groups.js';
import { registeredToolNames, getRegisteredTool } from './helpers/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { z } from 'zod';
import * as h from '../src/handlers/pantry.js';

afterEach(() => vi.restoreAllMocks());

function mockPantry(overrides: Record<string, unknown> = {}): TandoorClient {
  return { pantry: {
    listHouseholds: vi.fn(), getHousehold: vi.fn(), listLocations: vi.fn(), getLocation: vi.fn(),
    createLocation: vi.fn(), patchLocation: vi.fn(), previewLocationCascade: vi.fn(), deleteLocation: vi.fn(),
    listEntries: vi.fn(), getEntry: vi.fn(), createEntry: vi.fn(),
    patchEntry: vi.fn(), deleteEntry: vi.fn(), listLogs: vi.fn(), getLog: vi.fn(),
    ...overrides,
  },
    foodUnits: { getFood: vi.fn(), getUnit: vi.fn() },
  } as unknown as TandoorClient;
}

describe('PantryClient Tandoor inventory API', () => {
  it('uses exact inventory endpoints, filters and bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 }),
    );
    const client = new PantryClient({ url: 'https://recipes.example.test/path/to/ui', token: 'secret' });
    await client.listEntries({ empty: true, inventory_location_id: 8, food_id: 12, page_size: 5 });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://recipes.example.test/api/inventory-entry/?inventory_location_id=8&food_id=12&page_size=5&empty=true');
    expect((options?.headers as Record<string,string>)['Authorization']).toBe('Bearer secret');

    await client.listEntries({ empty: false, page_size: 2 });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://recipes.example.test/api/inventory-entry/?page_size=2',
    );

    await client.listLocations();
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('https://recipes.example.test/api/inventory-location/');
    await client.listLogs({ entry_id: 4 });
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe('https://recipes.example.test/api/inventory-log/?entry_id=4');
  });

  it('posts existing foreign keys as nested id objects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 8 }), { status: 201 }),
    );
    const client = new PantryClient({ url: 'https://recipes.example.test', token: 't' });
    await client.createEntry({ inventory_location: { id: 2 }, food: { id: 6 }, unit: { id: 9 }, amount: 2.5 });
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://recipes.example.test/api/inventory-entry/');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      inventory_location: { id: 2 }, food: { id: 6 }, unit: { id: 9 }, amount: 2.5,
    });
  });
});

describe('pantry handlers', () => {
  it('lists stock with slim projection and paging', async () => {
    const listEntries = vi.fn(async () => ({
      count: 1, next: null, previous: null,
      results: [{ id: 7, code: 'A', food: { id: 2, name: 'Milk' },
        unit: { id: 3, name: 'l' }, inventory_location: { id: 4, name: 'Fridge' },
        amount: 1.5, expires: '2026-11-01', sub_location: 'shelf', note: null,
        extra: 'not in slim' }],
    }));
    const client = mockPantry({ listEntries });
    const response = JSON.parse(await h.handleListPantryEntries(client, { page: 1, page_size: 5, empty: true }));
    expect(listEntries).toHaveBeenCalledWith({ page: 1, page_size: 5, empty: true }, { signal: undefined });
    expect(response.count).toBe(1);
    expect(response.results[0]).toMatchObject({
      id: 7, food: 'Milk', food_id: 2, unit: 'l', amount: 1.5,
      inventory_location: 'Fridge', inventory_location_id: 4, expires: '2026-11-01',
    });
    expect(response.results[0]).not.toHaveProperty('extra');
  });

  it('creates an entry with hydrated nested references and expiry', async () => {
    const createEntry = vi.fn(async (body) => ({ id: 8, ...body }));
    const client = mockPantry({
      createEntry,
      getLocation: vi.fn(async () => ({
        id: 4, name: 'Fridge', is_freezer: false,
        household: { id: 7, name: 'Home' },
      })),
    });
    (client as any).foodUnits.getFood = vi.fn(async () => ({ id: 2, name: 'Milk' }));
    (client as any).foodUnits.getUnit = vi.fn(async () => ({ id: 3, name: 'l' }));
    const text = await h.handleCreatePantryEntry(client, {
      inventory_location_id: 4, food_id: 2, unit_id: 3, amount: 1.5,
      expires: '2026-11-01', note: 'opened',
    });
    expect(createEntry).toHaveBeenCalledWith({
      inventory_location: { id: 4, name: 'Fridge', household: { id: 7, name: 'Home' }, is_freezer: false },
      food: { id: 2, name: 'Milk' }, unit: { id: 3, name: 'l' },
      amount: 1.5, expires: '2026-11-01', note: 'opened',
    }, { signal: undefined });
    expect(text).toContain('Pantry entry created.');
  });

  it('creates a location using an existing hydrated household', async () => {
    const createLocation = vi.fn(async (body) => ({ id: 6, ...body }));
    const client = mockPantry({
      getHousehold: vi.fn(async () => ({ id: 7, name: 'Home' })), createLocation,
    });
    const output = await h.handleCreatePantryLocation(client, {
      name: 'Freezer', household_id: 7, is_freezer: true,
    });
    expect(createLocation).toHaveBeenCalledWith({
      name: 'Freezer', household: { id: 7, name: 'Home' }, is_freezer: true,
    }, { signal: undefined });
    expect(output).toContain('Pantry location created.');
  });

  it('sets absolute stock amount=0, while rejecting empty patches', async () => {
    const patchEntry = vi.fn(async () => ({ id: 4, amount: 0 }));
    const client = mockPantry({ patchEntry });
    await h.handleUpdatePantryEntry(client, { id: 4, amount: 0 });
    expect(patchEntry).toHaveBeenCalledWith(4, { amount: 0 }, { signal: undefined });
    await expect(h.handleUpdatePantryEntry(client, { id: 4 })).rejects.toThrow('At least one field required');
    expect(patchEntry).toHaveBeenCalledTimes(1);
  });

  it('does not delete a location with stock records, including zero-quantity records', async () => {
    const listEntries = vi.fn(async () => ({ count: 1, results: [{ id: 7 }] }));
    const deleteLocation = vi.fn();
    const client = mockPantry({ listEntries, deleteLocation });
    await expect(h.handleDeletePantryLocation(client, { id: 3 })).rejects.toThrow('not empty');
    expect(listEntries).toHaveBeenCalledWith(
      { inventory_location_id: 3, empty: true, page_size: 1 },
      { signal: undefined },
    );
    expect(deleteLocation).not.toHaveBeenCalled();
  });

  it('allows deletion of an empty location', async () => {
    const deleteLocation = vi.fn(async () => undefined);
    const client = mockPantry({
      listEntries: vi.fn(async () => ({ count: 0, results: [] })),
      previewLocationCascade: vi.fn(async () => ({ count: 0, results: [] })),
      deleteLocation,
    });
    await h.handleDeletePantryLocation(client, { id: 3 });
    expect(deleteLocation).toHaveBeenCalledWith(3, { signal: undefined });
  });

  it('does not delete an empty location if historical logs would cascade', async () => {
    const deleteLocation = vi.fn();
    const client = mockPantry({
      listEntries: vi.fn(async () => ({ count: 0, results: [] })),
      previewLocationCascade: vi.fn(async () => ({ count: 1, results: [{ model: 'InventoryLog' }] })),
      deleteLocation,
    });
    await expect(h.handleDeletePantryLocation(client, { id: 3 })).rejects.toThrow('dependent records');
    expect(deleteLocation).not.toHaveBeenCalled();
  });

  it('lists history with booking type and quantity changes', async () => {
    const client = mockPantry({ listLogs: vi.fn(async () => ({
      count: 1, results: [{ id: 1, booking_type: 'remove', entry: { id: 3, food: { name: 'Egg' } },
        old_amount: 6, new_amount: 4, old_inventory_location: { name: 'Fridge' },
        new_inventory_location: { name: 'Fridge' }, created_at: '2026-10-18T00:00:00Z' }],
    })) });
    const v = JSON.parse(await h.handleListPantryLogs(client, { entry_id: 3 }));
    expect(v.results[0]).toMatchObject({
      entry_id: 3, food: 'Egg', booking_type: 'remove', old_amount: 6, new_amount: 4,
    });
  });

  it('validates stock quantities and date shape', () => {
    const create = z.object(createPantryEntryShape);
    const update = z.object(updatePantryEntryShape);
    expect(create.safeParse({ inventory_location_id: 1, food_id: 2, unit_id: 3, amount: -1 }).success).toBe(false);
    expect(create.safeParse({ inventory_location_id: 1, food_id: 2, unit_id: 3, amount: 1, expires: 'tomorrow' }).success).toBe(false);
    expect(create.safeParse({ inventory_location_id: 1, food_id: 2, unit_id: 3, amount: 0, expires: '2026-10-20' }).success).toBe(true);
    expect(update.safeParse({ id: 1, amount: 0 }).success).toBe(true);
  });
});

describe('pantry registration and feature gating', () => {
  it('registers 13 tools; read tools are core and writes grouped', () => {
    const server = new McpServer({ name: 'pantry-test', version: '1' });
    const client = new TandoorClient({ url: 'https://x.test', token: 't' });
    registerPantryTools(server, client);
    const tools = registeredToolNames(server);
    expect(tools).toHaveLength(13);
    expect(tools).toContain('list_pantry_entries');
    expect(tools).toContain('delete_pantry_location');
    for (const name of tools) {
      expect(findToolGroup(name)).not.toBe('ungrouped');
    }
    expect(CORE_TOOLS.has('list_pantry_entries')).toBe(true);
    expect(findToolGroup('create_pantry_entry')).toBe('pantry-write');
    expect(getRegisteredTool(server, 'list_pantry_entries')).toBeDefined();
  });

  it('core profile hides pantry mutations; pantry profile only adds pantry writes', () => {
    _resetRegisteredNames(); _resetArraySkipLog();
    const client = new TandoorClient({ url: 'https://x.test', token: 't' });
    const opts = { pkg: { name: 'test', version: '0' },
      versionCheck: { status: 'ok' as const, level: 'note' as const, detail: 'test' } };
    const core = new McpServer({ name: 'core', version: '1' });
    registerAllTools(core, client, { ...opts, profile: 'core' });
    const coreTools = (core as any)._registeredTools as Record<string, { enabled: boolean }>;
    expect(coreTools['list_pantry_entries']?.enabled).toBe(true);
    expect(coreTools['create_pantry_entry']?.enabled).toBe(false);

    const pantry = new McpServer({ name: 'pantry', version: '1' });
    registerAllTools(pantry, client, { ...opts, profile: 'pantry' });
    const pantryTools = (pantry as any)._registeredTools as Record<string, { enabled: boolean }>;
    expect(pantryTools['create_pantry_entry']?.enabled).toBe(true);
    expect(pantryTools['list_units']?.enabled).toBe(true);
    expect(pantryTools['create_recipe']?.enabled).toBe(false);
  });
});
