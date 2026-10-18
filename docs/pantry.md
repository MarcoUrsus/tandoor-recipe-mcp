# Pantry / inventory MCP support (Tandoor 2.6.15+)

The Pantry in Tandoor 2.6.15 is a **quantity-based inventory**, separate from
the legacy per-food `food_onhand` flag and the older MCP resource
`tandoor://pantry/on-hand`. The inventory data is scoped to the active Tandoor
space. An API token must have access to the relevant space and inventory.

## Tools

Seven read tools (included in the `core` and `pantry` profiles):

- `list_pantry_households`: discover household IDs for locations
- `list_pantry_locations` / `get_pantry_location`: available storage locations
- `list_pantry_entries` / `get_pantry_entry`: food quantities, units, locations, expiry dates
- `list_pantry_logs` / `get_pantry_log`: inventory booking history (read only)

Six write tools (enabled in `pantry` and `full` profiles):

- `create_pantry_location`, `update_pantry_location`, `delete_pantry_location`
- `create_pantry_entry`, `update_pantry_entry`, `delete_pantry_entry`

The `pantry` profile enables **core read tools plus these six Pantry writes and `list_units`**,
but leaves unrelated recipe/admin writes disabled. This is particularly useful
for **stateless HTTP** mode where `enable_tool_group` is intentionally disabled.
In stdio `core` mode, `enable_tool_group({group:"pantry-write"})` enables writes
for the duration of the session.

## Activation in the Proxmox LXC

Set the environment variable where the `tandoor-mcp` systemd service loads
its other `TANDOOR_MCP_*` settings:

```dotenv
TANDOOR_MCP_PROFILE=pantry
```

Rebuild the fork and restart the service:

```bash
cd /opt/tandoor-mcp-fixed
git pull --ff-only
npm install --no-save
npm run build
sudo systemctl restart tandoor-mcp
```

Ensure `ExecStart` still uses `/opt/tandoor-mcp-fixed/build/index.js`, not
the original npm package.

## Suggested workflow

1. Call `list_pantry_households` and `list_pantry_locations`. If needed,
   create a new location using an existing `household_id`.
2. Resolve existing food and unit IDs with `list_foods` and `list_units`.
3. Add an entry using `create_pantry_entry`:
   ```json
   {
     "inventory_location_id": 1,
     "food_id": 2,
     "unit_id": 3,
     "amount": 2.5,
     "expires": "2026-11-15",
     "sub_location": "upper shelf"
   }
   ```
4. Use `update_pantry_entry({"id":10,"amount":1.5})` to set the **absolute**
   amount to 1.5. This is *not* a +1.5 adjustment and is not an atomic
   increment/decrement.
5. Call `list_pantry_logs({"entry_id":10})` to review booking history.

Important details:

- `list_pantry_entries` excludes zero-amount entries by default. Pass
  `empty:true` to include them.
- `expires` is `YYYY-MM-DD`. Set `expires:null` in an update to clear it.
- Creating a pantry entry uses existing food/location/unit objects and does
  not automatically create new foods or units.
- `delete_pantry_entry` permanently deletes its booking logs. Prefer
  setting `amount:0` when consuming all stock.
- `delete_pantry_location` refuses to delete a location if **any** entries
  remain, including zero-amount entries; deletion otherwise cascades records.
- Writes need Tandoor 2.6.15 or later. Older 2.x releases lack these APIs.
- These API tools have unit/regression tests; validate them against your
  own upgraded Tandoor before using them for destructive operations.
