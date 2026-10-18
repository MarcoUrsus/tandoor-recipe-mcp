// Pantry/inventory MCP tools for Tandoor 2.6.15+.
// Inventory records track quantities and locations; food_onhand is a separate legacy flag.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import * as h from '../handlers/pantry.js';

const id = z.number().int().positive();
const page = z.number().int().positive().optional();
const amount = z.number().finite().nonnegative();
const expiry = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional();
const text64 = z.string().max(64).nullable().optional();
const note = z.string().max(256).nullable().optional();

export const listPantryHouseholdsShape = { page, page_size: page, format: formatEnum } as const;
export const listPantryLocationsShape = { page, page_size: page, format: formatEnum } as const;
export const getPantryLocationShape = { id, format: formatEnum } as const;
export const createPantryLocationShape = {
  name: z.string().trim().min(1).max(64),
  household_id: id,
  is_freezer: z.boolean().optional(),
  format: formatEnum,
} as const;
export const updatePantryLocationShape = {
  id, name: z.string().trim().min(1).max(64).optional(),
  household_id: id.optional(), is_freezer: z.boolean().optional(),
  format: formatEnum,
} as const;
export const deletePantryLocationShape = { id } as const;

export const listPantryEntriesShape = {
  page, page_size: page, empty: z.boolean().optional(),
  code: z.string().optional(), food_id: id.optional(),
  inventory_location_id: id.optional(), format: formatEnum,
} as const;
export const getPantryEntryShape = { id, format: formatEnum } as const;
export const createPantryEntryShape = {
  inventory_location_id: id,
  food_id: id,
  unit_id: id,
  amount,
  expires: expiry,
  sub_location: text64,
  code: z.string().max(16).nullable().optional(),
  note,
  format: formatEnum,
} as const;
export const updatePantryEntryShape = {
  id, inventory_location_id: id.optional(), food_id: id.optional(),
  unit_id: id.optional(), amount: amount.optional(), expires: expiry,
  sub_location: text64,
  code: z.string().max(16).nullable().optional(),
  note, format: formatEnum,
} as const;
export const deletePantryEntryShape = { id } as const;
export const listPantryLogsShape = {
  entry_id: id.optional(), food_id: id.optional(), page, page_size: page, format: formatEnum,
} as const;
export const getPantryLogShape = { id, format: formatEnum } as const;

export type ListPantryHouseholdsArgs = z.infer<z.ZodObject<typeof listPantryHouseholdsShape>>;
export type ListPantryLocationsArgs = z.infer<z.ZodObject<typeof listPantryLocationsShape>>;
export type GetPantryLocationArgs = z.infer<z.ZodObject<typeof getPantryLocationShape>>;
export type CreatePantryLocationArgs = z.infer<z.ZodObject<typeof createPantryLocationShape>>;
export type UpdatePantryLocationArgs = z.infer<z.ZodObject<typeof updatePantryLocationShape>>;
export type DeletePantryLocationArgs = z.infer<z.ZodObject<typeof deletePantryLocationShape>>;
export type ListPantryEntriesArgs = z.infer<z.ZodObject<typeof listPantryEntriesShape>>;
export type GetPantryEntryArgs = z.infer<z.ZodObject<typeof getPantryEntryShape>>;
export type CreatePantryEntryArgs = z.infer<z.ZodObject<typeof createPantryEntryShape>>;
export type UpdatePantryEntryArgs = z.infer<z.ZodObject<typeof updatePantryEntryShape>>;
export type DeletePantryEntryArgs = z.infer<z.ZodObject<typeof deletePantryEntryShape>>;
export type ListPantryLogsArgs = z.infer<z.ZodObject<typeof listPantryLogsShape>>;
export type GetPantryLogArgs = z.infer<z.ZodObject<typeof getPantryLogShape>>;

export function registerPantryTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_pantry_households', {
    description: 'List households and IDs used to create pantry storage locations (Tandoor inventory).',
    inputSchema: listPantryHouseholdsShape,
  }, h.handleListPantryHouseholds);
  registerStringTool(server, client, 'list_pantry_locations', {
    description: 'List pantry/inventory storage locations (e.g. fridge, freezer, pantry cupboard).',
    inputSchema: listPantryLocationsShape,
  }, h.handleListPantryLocations);
  registerStringTool(server, client, 'get_pantry_location', {
    description: 'Get an inventory location by ID, including its household and freezer flag.',
    inputSchema: getPantryLocationShape,
  }, h.handleGetPantryLocation);
  registerStringTool(server, client, 'create_pantry_location', {
    description: 'Create an inventory location; requires name and an existing household_id from list_pantry_households.',
    inputSchema: createPantryLocationShape,
  }, h.handleCreatePantryLocation);
  registerStringTool(server, client, 'update_pantry_location', {
    description: 'PATCH an inventory location: name, household_id and/or is_freezer. Must specify a change.',
    inputSchema: updatePantryLocationShape,
  }, h.handleUpdatePantryLocation);
  registerStringTool(server, client, 'delete_pantry_location', {
    description: 'Delete an EMPTY pantry location. Refuses if any inventory entries remain (even amount=0); deleting a populated location would cascade and destroy stored entries and logs.',
    inputSchema: deletePantryLocationShape,
  }, h.handleDeletePantryLocation);
  registerStringTool(server, client, 'list_pantry_entries', {
    description: 'List quantity-based pantry inventory entries (food, amount, unit, expiration, location). By default Tandoor hides amount=0; set empty=true to include them. Filter by food_id, inventory_location_id or code. Separate from food_onhand.',
    inputSchema: listPantryEntriesShape,
  }, h.handleListPantryEntries);
  registerStringTool(server, client, 'get_pantry_entry', {
    description: 'Get a pantry inventory entry by ID, including its current absolute amount and expiration date.',
    inputSchema: getPantryEntryShape,
  }, h.handleGetPantryEntry);
  registerStringTool(server, client, 'create_pantry_entry', {
    description: 'Add a pantry inventory entry. Supply existing location/food/unit IDs and starting quantity. Tandoor logs the insertion. Do not use this to create Food or Unit entities.',
    inputSchema: createPantryEntryShape,
  }, h.handleCreatePantryEntry);
  registerStringTool(server, client, 'update_pantry_entry', {
    description: 'PATCH a pantry inventory entry. amount sets the ABSOLUTE current quantity (not a delta); use 0 when consumed. Can update expiration, location and notes. Tandoor creates movement/quantity logs.',
    inputSchema: updatePantryEntryShape,
  }, h.handleUpdatePantryEntry);
  registerStringTool(server, client, 'delete_pantry_entry', {
    description: 'PERMANENTLY delete pantry inventory entry by ID; this also cascades to its inventory logs. Prefer update_pantry_entry(amount=0) to record consumption.',
    inputSchema: deletePantryEntryShape,
  }, h.handleDeletePantryEntry);
  registerStringTool(server, client, 'list_pantry_logs', {
    description: 'Read inventory booking history (add, remove, move) filtered by entry_id or food_id; newest first. Read only.',
    inputSchema: listPantryLogsShape,
  }, h.handleListPantryLogs);
  registerStringTool(server, client, 'get_pantry_log', {
    description: 'Retrieve an individual read-only pantry inventory log entry.',
    inputSchema: getPantryLogShape,
  }, h.handleGetPantryLog);
}
