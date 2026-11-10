/**
 * Menu (categories, items) and tables: dashboard editing (D1b) and the tablet downloads.
 *
 * Every input is validated here; anything unexpected is INVALID_INPUT. Nothing is ever deleted,
 * only deactivated (D-21). Column names in UPDATEs come from this file, never from the request.
 */
import { audit, fail, type AdminActor, type AdminResult } from "./admin";

/** The MVP stations (K-10, D-68). Configurable stations would be a later migration. */
export const STATIONS = ["kitchen", "bar"] as const;
export type StationId = (typeof STATIONS)[number];
export const isStation = (v: unknown): v is StationId => (STATIONS as readonly unknown[]).includes(v);

const BAD = Symbol("invalid");
type Bad = typeof BAD;

// ---------- field parsers: return the value, `undefined` (not given) or BAD ----------

function requiredText(v: unknown, max: number): string | Bad {
  if (typeof v !== "string") return BAD;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : BAD;
}

/** Optional text: missing → undefined, null or "" → null (cleared). */
function optionalText(v: unknown, max: number): string | null | undefined | Bad {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return BAD;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.length <= max ? s : BAD;
}

function intBetween(v: unknown, min: number, max: number): number | undefined | Bad {
  if (v === undefined) return undefined;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : BAD;
}

function bool(v: unknown): boolean | undefined | Bad {
  if (v === undefined) return undefined;
  return typeof v === "boolean" ? v : BAD;
}

/**
 * ETB as text with up to 2 decimals ("180", "42.50") → whole santim. Numbers are refused:
 * 42.5 in JSON is a binary float, and money must never pass through one.
 */
export function parsePrice(v: unknown): number | Bad {
  if (typeof v !== "string") return BAD;
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (match === null) return BAD;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function formatPrice(santim: number): string {
  return `${Math.floor(santim / 100)}.${String(santim % 100).padStart(2, "0")}`;
}

const anyBad = (...values: unknown[]) => values.some((v) => v === BAD);

/** UPDATE only the given columns (whose names come from this file). */
function update(sql: SqlStorage, table: string, id: string, changes: Record<string, SqlStorageValue | undefined>): string[] {
  const entries = Object.entries(changes).filter((e): e is [string, SqlStorageValue] => e[1] !== undefined);
  if (entries.length > 0) {
    sql.exec(`UPDATE ${table} SET ${entries.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`, ...entries.map(([, v]) => v), id);
  }
  return entries.map(([c]) => c);
}

const flag = (b: boolean | undefined) => (b === undefined ? undefined : b ? 1 : 0);

// ---------- categories ----------

type CategoryRow = { id: string; name_en: string; name_am: string | null; sort_order: number; active: number };
const toCategory = (r: CategoryRow) => ({ id: r.id, nameEn: r.name_en, nameAm: r.name_am, sortOrder: r.sort_order, active: r.active === 1 });
export type Category = ReturnType<typeof toCategory>;

function findCategory(sql: SqlStorage, venueId: string, id: string): CategoryRow | null {
  return (
    sql
      .exec<CategoryRow>("SELECT id, name_en, name_am, sort_order, active FROM categories WHERE id = ? AND venue_id = ?", id, venueId)
      .toArray()[0] ?? null
  );
}

export function listCategories(sql: SqlStorage, actor: AdminActor): AdminResult<{ categories: Category[] }> {
  const rows = sql
    .exec<CategoryRow>("SELECT id, name_en, name_am, sort_order, active FROM categories WHERE venue_id = ? ORDER BY sort_order, name_en", actor.venue_id)
    .toArray();
  return { ok: true, categories: rows.map(toCategory) };
}

export function createCategory(sql: SqlStorage, actor: AdminActor, b: Record<string, unknown>): AdminResult<{ category: Category }> {
  const nameEn = requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  if (nameEn === BAD || nameAm === BAD || sortOrder === BAD) return fail("INVALID_INPUT");

  const id = crypto.randomUUID();
  sql.exec(
    "INSERT INTO categories (id, venue_id, name_en, name_am, sort_order) VALUES (?, ?, ?, ?, ?)",
    id,
    actor.venue_id,
    nameEn,
    nameAm ?? null,
    sortOrder ?? 0,
  );
  audit(sql, actor, "category.created", { categoryId: id });
  return { ok: true, category: toCategory(findCategory(sql, actor.venue_id, id)!) };
}

export function updateCategory(sql: SqlStorage, actor: AdminActor, id: string, b: Record<string, unknown>): AdminResult<{ category: Category }> {
  if (findCategory(sql, actor.venue_id, id) === null) return fail("NOT_FOUND");
  const nameEn = b.nameEn === undefined ? undefined : requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  const active = bool(b.active);
  if (anyBad(nameEn, nameAm, sortOrder, active)) return fail("INVALID_INPUT");

  const changed = update(sql, "categories", id, {
    name_en: nameEn as string | undefined,
    name_am: nameAm as string | null | undefined,
    sort_order: sortOrder as number | undefined,
    active: flag(active as boolean | undefined),
  });
  audit(sql, actor, "category.updated", { categoryId: id, changed });
  return { ok: true, category: toCategory(findCategory(sql, actor.venue_id, id)!) };
}

// ---------- menu items ----------

type ItemRow = {
  id: string;
  category_id: string | null;
  name: string;
  name_am: string | null;
  price_santim: number;
  station_id: string;
  fasting: number;
  sold_out: number;
  sort_order: number;
  active: number;
};
const ITEM_COLUMNS = "id, category_id, name, name_am, price_santim, station_id, fasting, sold_out, sort_order, active";
const toItem = (r: ItemRow) => ({
  id: r.id,
  categoryId: r.category_id,
  nameEn: r.name, // menu_items.name is the English name (D-67)
  nameAm: r.name_am,
  price: formatPrice(r.price_santim),
  priceSantim: r.price_santim,
  stationId: r.station_id,
  fasting: r.fasting === 1,
  soldOut: r.sold_out === 1,
  sortOrder: r.sort_order,
  active: r.active === 1,
});
export type MenuItem = ReturnType<typeof toItem>;

function findItem(sql: SqlStorage, venueId: string, id: string): ItemRow | null {
  return sql.exec<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM menu_items WHERE id = ? AND venue_id = ?`, id, venueId).toArray()[0] ?? null;
}

/** A category id that exists, is active and belongs to this café, else BAD. */
function categoryRef(sql: SqlStorage, venueId: string, v: unknown): string | undefined | Bad {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return BAD;
  const category = findCategory(sql, venueId, v);
  return category !== null && category.active === 1 ? v : BAD;
}

export function listMenuItems(sql: SqlStorage, actor: AdminActor): AdminResult<{ items: MenuItem[] }> {
  const rows = sql
    .exec<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM menu_items WHERE venue_id = ? ORDER BY sort_order, name`, actor.venue_id)
    .toArray();
  return { ok: true, items: rows.map(toItem) };
}

export function createMenuItem(sql: SqlStorage, actor: AdminActor, b: Record<string, unknown>): AdminResult<{ item: MenuItem }> {
  const categoryId = b.categoryId === undefined ? BAD : categoryRef(sql, actor.venue_id, b.categoryId);
  const nameEn = requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const price = parsePrice(b.price);
  const stationId = isStation(b.stationId) ? b.stationId : BAD;
  const fasting = bool(b.fasting);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  if (anyBad(categoryId, nameEn, nameAm, price, stationId, fasting, sortOrder)) return fail("INVALID_INPUT");

  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO menu_items (id, venue_id, category_id, name, name_am, price_santim, station_id, fasting, sort_order, sold_out, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    id,
    actor.venue_id,
    categoryId as string,
    nameEn as string,
    (nameAm as string | null | undefined) ?? null,
    price as number,
    stationId as string,
    fasting === true ? 1 : 0,
    (sortOrder as number | undefined) ?? 0,
  );
  audit(sql, actor, "menu_item.created", { menuItemId: id });
  return { ok: true, item: toItem(findItem(sql, actor.venue_id, id)!) };
}

export function updateMenuItem(sql: SqlStorage, actor: AdminActor, id: string, b: Record<string, unknown>): AdminResult<{ item: MenuItem }> {
  if (findItem(sql, actor.venue_id, id) === null) return fail("NOT_FOUND");
  const categoryId = categoryRef(sql, actor.venue_id, b.categoryId);
  const nameEn = b.nameEn === undefined ? undefined : requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const price = b.price === undefined ? undefined : parsePrice(b.price);
  const stationId = b.stationId === undefined ? undefined : isStation(b.stationId) ? b.stationId : BAD;
  const fasting = bool(b.fasting);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  const active = bool(b.active);
  if (anyBad(categoryId, nameEn, nameAm, price, stationId, fasting, sortOrder, active)) return fail("INVALID_INPUT");

  // A price change never alters orders already sent: they copied the price (D-17).
  const changed = update(sql, "menu_items", id, {
    category_id: categoryId as string | undefined,
    name: nameEn as string | undefined,
    name_am: nameAm as string | null | undefined,
    price_santim: price as number | undefined,
    station_id: stationId as string | undefined,
    fasting: flag(fasting as boolean | undefined),
    sort_order: sortOrder as number | undefined,
    active: flag(active as boolean | undefined),
  });
  audit(sql, actor, "menu_item.updated", { menuItemId: id, changed });
  return { ok: true, item: toItem(findItem(sql, actor.venue_id, id)!) };
}

// ---------- tables ----------

type TableRow = { id: string; name: string; area: string | null; seats: number | null; sort_order: number; active: number };
const TABLE_COLUMNS = "id, name, area, seats, sort_order, active";
const toTable = (r: TableRow) => ({ id: r.id, name: r.name, area: r.area, seats: r.seats, sortOrder: r.sort_order, active: r.active === 1 });
export type Table = ReturnType<typeof toTable>;

function findTable(sql: SqlStorage, venueId: string, id: string): TableRow | null {
  return sql.exec<TableRow>(`SELECT ${TABLE_COLUMNS} FROM tables WHERE id = ? AND venue_id = ?`, id, venueId).toArray()[0] ?? null;
}

function seatsField(v: unknown): number | null | undefined | Bad {
  return v === null ? null : intBetween(v, 1, 99);
}

export function listTables(sql: SqlStorage, actor: AdminActor): AdminResult<{ tables: Table[] }> {
  const rows = sql.exec<TableRow>(`SELECT ${TABLE_COLUMNS} FROM tables WHERE venue_id = ? ORDER BY sort_order, name`, actor.venue_id).toArray();
  return { ok: true, tables: rows.map(toTable) };
}

export function createTable(sql: SqlStorage, actor: AdminActor, b: Record<string, unknown>): AdminResult<{ table: Table }> {
  const name = requiredText(b.name, 30);
  const area = optionalText(b.area, 30);
  const seats = seatsField(b.seats);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  if (anyBad(name, area, seats, sortOrder)) return fail("INVALID_INPUT");

  const id = crypto.randomUUID();
  sql.exec(
    "INSERT INTO tables (id, venue_id, name, area, seats, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
    id,
    actor.venue_id,
    name as string,
    (area as string | null | undefined) ?? null,
    (seats as number | null | undefined) ?? null,
    (sortOrder as number | undefined) ?? 0,
  );
  audit(sql, actor, "table.created", { tableId: id });
  return { ok: true, table: toTable(findTable(sql, actor.venue_id, id)!) };
}

export function updateTable(sql: SqlStorage, actor: AdminActor, id: string, b: Record<string, unknown>): AdminResult<{ table: Table }> {
  if (findTable(sql, actor.venue_id, id) === null) return fail("NOT_FOUND");
  const name = b.name === undefined ? undefined : requiredText(b.name, 30);
  const area = optionalText(b.area, 30);
  const seats = b.seats === undefined ? undefined : seatsField(b.seats);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  const active = bool(b.active);
  if (anyBad(name, area, seats, sortOrder, active)) return fail("INVALID_INPUT");

  // Guests are seated: deactivating would hide a table that still has food coming.
  if (active === false && sql.exec("SELECT 1 FROM table_sessions WHERE table_id = ? AND status = 'open'", id).toArray().length > 0) {
    return fail("TABLE_IN_USE");
  }
  const changed = update(sql, "tables", id, {
    name: name as string | undefined,
    area: area as string | null | undefined,
    seats: seats as number | null | undefined,
    sort_order: sortOrder as number | undefined,
    active: flag(active as boolean | undefined),
  });
  audit(sql, actor, "table.updated", { tableId: id, changed });
  return { ok: true, table: toTable(findTable(sql, actor.venue_id, id)!) };
}

// ---------- tablet downloads (GET /menu, GET /tables) ----------

/** What a tablet stores locally: active categories and items only, both names (the app picks the language). */
export function tabletMenu(sql: SqlStorage, venueId: string) {
  const categories = sql
    .exec<CategoryRow>(
      "SELECT id, name_en, name_am, sort_order, active FROM categories WHERE venue_id = ? AND active = 1 ORDER BY sort_order, name_en",
      venueId,
    )
    .toArray()
    .map((c) => ({ id: c.id, nameEn: c.name_en, nameAm: c.name_am, sortOrder: c.sort_order }));
  const items = sql
    .exec<ItemRow>(
      `SELECT ${ITEM_COLUMNS.split(", ").map((c) => `m.${c}`).join(", ")}
         FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.venue_id = ? AND m.active = 1 AND (m.category_id IS NULL OR c.active = 1)
        ORDER BY m.sort_order, m.name`,
      venueId,
    )
    .toArray()
    .map((r) => {
      const { price: _price, active: _active, ...item } = toItem(r);
      return item;
    });
  return { categories, items };
}

/** Active tables with their live state: free, or open and held by a waiter. */
export function tabletTables(sql: SqlStorage, venueId: string) {
  return sql
    .exec<TableRow & { session_id: string | null; waiter_id: string | null }>(
      `SELECT t.id, t.name, t.area, t.seats, t.sort_order, t.active, s.id AS session_id, s.waiter_id
         FROM tables t LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'open'
        WHERE t.venue_id = ? AND t.active = 1
        ORDER BY t.sort_order, t.name`,
      venueId,
    )
    .toArray()
    .map((r) => ({
      id: r.id,
      name: r.name,
      area: r.area,
      seats: r.seats,
      sortOrder: r.sort_order,
      state: r.session_id === null ? ("free" as const) : ("open" as const),
      sessionId: r.session_id,
      waiterId: r.waiter_id,
    }));
}
