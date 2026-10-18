// Tandoor 2.6.15 inventory API ("Pantry"): distinct from Food.food_onhand.
import { BaseClient, qs } from './base.js';
import type { TandoorRequestOptions } from './base.js';

type Opts = Pick<TandoorRequestOptions, 'signal'>;
type Page = { page?: number; page_size?: number };
export type PantryEntryFilters = Page & {
  empty?: boolean; code?: string; food_id?: number; inventory_location_id?: number;
};
export type PantryLogFilters = Page & { entry_id?: number; food_id?: number };

export class PantryClient extends BaseClient {
  listHouseholds(params?: Page, opts?: Opts): Promise<any> {
    return this.request('/api/household/' + qs(params), { signal: opts?.signal });
  }
  getHousehold(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/household/${id}/`, { signal: opts?.signal });
  }
  listLocations(params?: Page, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-location/' + qs(params), { signal: opts?.signal });
  }
  getLocation(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${id}/`, { signal: opts?.signal });
  }
  createLocation(body: object, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-location/', {
      method: 'POST', body: JSON.stringify(body), signal: opts?.signal,
    });
  }
  patchLocation(id: number, body: object, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${id}/`, {
      method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal,
    });
  }
  previewLocationCascade(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${id}/cascading/?cache=false&page_size=1`, {
      signal: opts?.signal,
    });
  }
  deleteLocation(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/inventory-location/${id}/`, {
      method: 'DELETE', signal: opts?.signal,
    });
  }
  listEntries(params?: PantryEntryFilters, opts?: Opts): Promise<any> {
    // Tandoor 2.6.15 checks *presence* of the 'empty' query parameter,
    // not its value. Omit the param entirely when false.
    const { empty, ...filters } = params ?? {};
    return this.request('/api/inventory-entry/' + qs({
      ...filters, ...(empty === true ? { empty: true } : {}),
    }), { signal: opts?.signal });
  }
  getEntry(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-entry/${id}/`, { signal: opts?.signal });
  }
  createEntry(body: object, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-entry/', {
      method: 'POST', body: JSON.stringify(body), signal: opts?.signal,
    });
  }
  patchEntry(id: number, body: object, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-entry/${id}/`, {
      method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal,
    });
  }
  deleteEntry(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/inventory-entry/${id}/`, {
      method: 'DELETE', signal: opts?.signal,
    });
  }
  listLogs(params?: PantryLogFilters, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-log/' + qs(params), { signal: opts?.signal });
  }
  getLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-log/${id}/`, { signal: opts?.signal });
  }
}
