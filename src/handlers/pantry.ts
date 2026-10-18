import { TandoorClient } from '../clients/index.js';
import { assertNonEmptyBody, emit, slimPaginated } from '../lib/slim.js';
import type { HandlerContext } from '../lib/register.js';
import type {
  ListPantryHouseholdsArgs, ListPantryLocationsArgs, GetPantryLocationArgs,
  CreatePantryLocationArgs, UpdatePantryLocationArgs, DeletePantryLocationArgs,
  ListPantryEntriesArgs, GetPantryEntryArgs, CreatePantryEntryArgs,
  UpdatePantryEntryArgs, DeletePantryEntryArgs, ListPantryLogsArgs, GetPantryLogArgs,
} from '../tools/pantry.js';

function slimHousehold(v: any) {
  return v == null ? v : { id: v.id, name: v.name };
}
function slimLocation(v: any) {
  return v == null ? v : {
    id: v.id, name: v.name, is_freezer: v.is_freezer ?? false,
    household: slimHousehold(v.household),
  };
}
function slimEntry(v: any) {
  return v == null ? v : {
    id: v.id, code: v.code, food: v.food?.name ?? null, food_id: v.food?.id ?? null,
    unit: v.unit?.name ?? null, unit_id: v.unit?.id ?? null,
    amount: v.amount, expires: v.expires, note: v.note, sub_location: v.sub_location,
    inventory_location: v.inventory_location?.name ?? null,
    inventory_location_id: v.inventory_location?.id ?? null,
  };
}
function slimLog(v: any) {
  return v == null ? v : {
    id: v.id, entry_id: v.entry?.id ?? null,
    food: v.entry?.food?.name ?? null,
    booking_type: v.booking_type,
    old_amount: v.old_amount, new_amount: v.new_amount,
    old_inventory_location: v.old_inventory_location?.name ?? null,
    new_inventory_location: v.new_inventory_location?.name ?? null,
    note: v.note, created_at: v.created_at,
  };
}

export async function handleListPantryHouseholds(
  client: TandoorClient, args: ListPantryHouseholdsArgs, ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.pantry.listHouseholds(params, { signal: ctx?.signal });
  return emit(format === 'full' ? result : slimPaginated(result, slimHousehold));
}
export async function handleListPantryLocations(
  client: TandoorClient, args: ListPantryLocationsArgs, ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.pantry.listLocations(params, { signal: ctx?.signal });
  return emit(format === 'full' ? result : slimPaginated(result, slimLocation));
}
export async function handleGetPantryLocation(
  client: TandoorClient, args: GetPantryLocationArgs, ctx?: HandlerContext,
): Promise<string> {
  const result = await client.pantry.getLocation(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? result : slimLocation(result));
}
export async function handleCreatePantryLocation(
  client: TandoorClient, args: CreatePantryLocationArgs, ctx?: HandlerContext,
): Promise<string> {
  const body = {
    name: args.name, household: { id: args.household_id },
    ...(args.is_freezer !== undefined ? { is_freezer: args.is_freezer } : {}),
  };
  const result = await client.pantry.createLocation(body, { signal: ctx?.signal });
  return 'Pantry location created.\n\n' + emit(args.format === 'full' ? result : slimLocation(result));
}
export async function handleUpdatePantryLocation(
  client: TandoorClient, args: UpdatePantryLocationArgs, ctx?: HandlerContext,
): Promise<string> {
  const body: Record<string, unknown> = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.household_id !== undefined) body.household = { id: args.household_id };
  if (args.is_freezer !== undefined) body.is_freezer = args.is_freezer;
  assertNonEmptyBody(body);
  const result = await client.pantry.patchLocation(args.id, body, { signal: ctx?.signal });
  return 'Pantry location updated.\n\n' + emit(args.format === 'full' ? result : slimLocation(result));
}
export async function handleDeletePantryLocation(
  client: TandoorClient, args: DeletePantryLocationArgs, ctx?: HandlerContext,
): Promise<string> {
  // A location FK uses CASCADE. Refuse accidental deletion of stock/log history.
  const page = await client.pantry.listEntries({
    inventory_location_id: args.id, empty: true, page_size: 1,
  }, { signal: ctx?.signal });
  if (Number(page?.count ?? page?.results?.length ?? 0) > 0) {
    throw new Error('Pantry location is not empty. Move or delete its entries before deleting this location.');
  }
  await client.pantry.deleteLocation(args.id, { signal: ctx?.signal });
  return `Pantry location ${args.id} deleted.`;
}

export async function handleListPantryEntries(
  client: TandoorClient, args: ListPantryEntriesArgs, ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.pantry.listEntries(params, { signal: ctx?.signal });
  return emit(format === 'full' ? result : slimPaginated(result, slimEntry));
}
export async function handleGetPantryEntry(
  client: TandoorClient, args: GetPantryEntryArgs, ctx?: HandlerContext,
): Promise<string> {
  const result = await client.pantry.getEntry(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? result : slimEntry(result));
}
export async function handleCreatePantryEntry(
  client: TandoorClient, args: CreatePantryEntryArgs, ctx?: HandlerContext,
): Promise<string> {
  // DRF writable-nested serializers accept existing IDs wrapped in objects.
  const body: Record<string, unknown> = {
    inventory_location: { id: args.inventory_location_id },
    food: { id: args.food_id },
    unit: { id: args.unit_id },
    amount: args.amount,
  };
  for (const key of ['expires', 'sub_location', 'code', 'note'] as const) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  const result = await client.pantry.createEntry(body, { signal: ctx?.signal });
  return 'Pantry entry created.\n\n' + emit(args.format === 'full' ? result : slimEntry(result));
}
export async function handleUpdatePantryEntry(
  client: TandoorClient, args: UpdatePantryEntryArgs, ctx?: HandlerContext,
): Promise<string> {
  const body: Record<string, unknown> = {};
  if (args.inventory_location_id !== undefined) body.inventory_location = { id: args.inventory_location_id };
  if (args.food_id !== undefined) body.food = { id: args.food_id };
  if (args.unit_id !== undefined) body.unit = { id: args.unit_id };
  for (const key of ['amount', 'expires', 'sub_location', 'code', 'note'] as const) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  assertNonEmptyBody(body);
  const result = await client.pantry.patchEntry(args.id, body, { signal: ctx?.signal });
  return 'Pantry entry updated.\n\n' + emit(args.format === 'full' ? result : slimEntry(result));
}
export async function handleDeletePantryEntry(
  client: TandoorClient, args: DeletePantryEntryArgs, ctx?: HandlerContext,
): Promise<string> {
  await client.pantry.deleteEntry(args.id, { signal: ctx?.signal });
  return `Pantry entry ${args.id} permanently deleted (including its logs).`;
}
export async function handleListPantryLogs(
  client: TandoorClient, args: ListPantryLogsArgs, ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.pantry.listLogs(params, { signal: ctx?.signal });
  return emit(format === 'full' ? result : slimPaginated(result, slimLog));
}
export async function handleGetPantryLog(
  client: TandoorClient, args: GetPantryLogArgs, ctx?: HandlerContext,
): Promise<string> {
  const result = await client.pantry.getLog(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? result : slimLog(result));
}
