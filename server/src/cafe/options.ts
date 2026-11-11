/**
 * Item options and add-ons (W-05, D-77): reusable option groups attached to menu items, each
 * option adding an extra amount to the item's price. Dashboard editing, the tablet download, and
 * the check of a round's chosen options.
 */
import { audit, fail, type AdminActor, type AdminResult } from "./admin";
import { BAD, anyBad, bool, flag, formatPrice, intBetween, optionalText, parsePrice, requiredText, update, type Bad } from "./fields";

const MAX_GROUPS_PER_ITEM = 10;

// ---------- rows and shapes ----------

type GroupRow = { id: string; name_en: string; name_am: string | null; min_choices: number; max_choices: number; sort_order: number; active: number };
type OptionRow = { id: string; group_id: string; name_en: string; name_am: string | null; extra_santim: number; sort_order: number; active: number };
const GROUP_COLUMNS = "id, name_en, name_am, min_choices, max_choices, sort_order, active";
const OPTION_COLUMNS = "id, group_id, name_en, name_am, extra_santim, sort_order, active";

const toOption = (r: OptionRow) => ({
  id: r.id,
  groupId: r.group_id,
  nameEn: r.name_en,
  nameAm: r.name_am,
  extra: formatPrice(r.extra_santim),
  extraSantim: r.extra_santim,
  sortOrder: r.sort_order,
  active: r.active === 1,
});
export type Option = ReturnType<typeof toOption>;

const toGroup = (r: GroupRow, options: Option[]) => ({
  id: r.id,
  nameEn: r.name_en,
  nameAm: r.name_am,
  minChoices: r.min_choices,
  maxChoices: r.max_choices,
  sortOrder: r.sort_order,
  active: r.active === 1,
  options,
});
export type OptionGroup = ReturnType<typeof toGroup>;

function findGroup(sql: SqlStorage, venueId: string, id: string): GroupRow | null {
  return sql.exec<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM option_groups WHERE id = ? AND venue_id = ?`, id, venueId).toArray()[0] ?? null;
}
function findOption(sql: SqlStorage, venueId: string, id: string): OptionRow | null {
  return sql.exec<OptionRow>(`SELECT ${OPTION_COLUMNS} FROM options WHERE id = ? AND venue_id = ?`, id, venueId).toArray()[0] ?? null;
}
/** Same sort order: the order the manager added them (Small, Medium, Large), not alphabetical. */
function optionsOf(sql: SqlStorage, groupId: string, activeOnly: boolean): Option[] {
  return sql
    .exec<OptionRow>(`SELECT ${OPTION_COLUMNS} FROM options WHERE group_id = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY sort_order, rowid`, groupId)
    .toArray()
    .map(toOption);
}
const groupWithOptions = (sql: SqlStorage, r: GroupRow) => toGroup(r, optionsOf(sql, r.id, false));

// ---------- dashboard ----------

export function listOptionGroups(sql: SqlStorage, actor: AdminActor): AdminResult<{ groups: OptionGroup[] }> {
  const rows = sql.exec<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM option_groups WHERE venue_id = ? ORDER BY sort_order, name_en`, actor.venue_id).toArray();
  return { ok: true, groups: rows.map((r) => groupWithOptions(sql, r)) };
}

export function createOptionGroup(sql: SqlStorage, actor: AdminActor, b: Record<string, unknown>): AdminResult<{ group: OptionGroup }> {
  const nameEn = requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const min = intBetween(b.minChoices, 0, 10) ?? 0;
  const max = intBetween(b.maxChoices, 1, 10) ?? 1;
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  if (anyBad(nameEn, nameAm, min, max, sortOrder) || (min as number) > (max as number)) return fail("INVALID_INPUT");

  const id = crypto.randomUUID();
  sql.exec(
    "INSERT INTO option_groups (id, venue_id, name_en, name_am, min_choices, max_choices, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    actor.venue_id,
    nameEn as string,
    (nameAm as string | null | undefined) ?? null,
    min as number,
    max as number,
    (sortOrder as number | undefined) ?? 0,
  );
  audit(sql, actor, "option_group.created", { groupId: id });
  return { ok: true, group: groupWithOptions(sql, findGroup(sql, actor.venue_id, id)!) };
}

export function updateOptionGroup(sql: SqlStorage, actor: AdminActor, id: string, b: Record<string, unknown>): AdminResult<{ group: OptionGroup }> {
  const row = findGroup(sql, actor.venue_id, id);
  if (row === null) return fail("NOT_FOUND");
  const nameEn = b.nameEn === undefined ? undefined : requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const min = intBetween(b.minChoices, 0, 10);
  const max = intBetween(b.maxChoices, 1, 10);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  const active = bool(b.active);
  if (anyBad(nameEn, nameAm, min, max, sortOrder, active)) return fail("INVALID_INPUT");
  if (((min as number | undefined) ?? row.min_choices) > ((max as number | undefined) ?? row.max_choices)) return fail("INVALID_INPUT");

  const changed = update(sql, "option_groups", id, {
    name_en: nameEn as string | undefined,
    name_am: nameAm as string | null | undefined,
    min_choices: min as number | undefined,
    max_choices: max as number | undefined,
    sort_order: sortOrder as number | undefined,
    active: flag(active as boolean | undefined),
  });
  audit(sql, actor, "option_group.updated", { groupId: id, changed });
  return { ok: true, group: groupWithOptions(sql, findGroup(sql, actor.venue_id, id)!) };
}

/** The extra amount: ETB text with at most 2 decimals, like prices (D-70). Missing means 0. */
const extraField = (v: unknown): number | undefined | Bad => (v === undefined ? undefined : parsePrice(v));

export function createOption(sql: SqlStorage, actor: AdminActor, groupId: string, b: Record<string, unknown>): AdminResult<{ option: Option }> {
  if (findGroup(sql, actor.venue_id, groupId) === null) return fail("NOT_FOUND");
  const nameEn = requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const extra = extraField(b.extra);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  if (anyBad(nameEn, nameAm, extra, sortOrder)) return fail("INVALID_INPUT");

  const id = crypto.randomUUID();
  sql.exec(
    "INSERT INTO options (id, venue_id, group_id, name_en, name_am, extra_santim, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    actor.venue_id,
    groupId,
    nameEn as string,
    (nameAm as string | null | undefined) ?? null,
    (extra as number | undefined) ?? 0,
    (sortOrder as number | undefined) ?? 0,
  );
  audit(sql, actor, "option.created", { optionId: id, groupId });
  return { ok: true, option: toOption(findOption(sql, actor.venue_id, id)!) };
}

export function updateOption(sql: SqlStorage, actor: AdminActor, id: string, b: Record<string, unknown>): AdminResult<{ option: Option }> {
  if (findOption(sql, actor.venue_id, id) === null) return fail("NOT_FOUND");
  const nameEn = b.nameEn === undefined ? undefined : requiredText(b.nameEn, 60);
  const nameAm = optionalText(b.nameAm, 60);
  const extra = extraField(b.extra);
  const sortOrder = intBetween(b.sortOrder, 0, 9999);
  const active = bool(b.active);
  if (anyBad(nameEn, nameAm, extra, sortOrder, active)) return fail("INVALID_INPUT");

  // Orders already sent keep their snapshot (D-17).
  const changed = update(sql, "options", id, {
    name_en: nameEn as string | undefined,
    name_am: nameAm as string | null | undefined,
    extra_santim: extra as number | undefined,
    sort_order: sortOrder as number | undefined,
    active: flag(active as boolean | undefined),
  });
  audit(sql, actor, "option.updated", { optionId: id, changed });
  return { ok: true, option: toOption(findOption(sql, actor.venue_id, id)!) };
}

// ---------- attaching groups to items ----------

/** A list of unique, existing, active group ids of this café (at most 10), else BAD. */
export function parseGroupIds(sql: SqlStorage, venueId: string, v: unknown): string[] | Bad {
  if (!Array.isArray(v) || v.length > MAX_GROUPS_PER_ITEM) return BAD;
  if (!v.every((id): id is string => typeof id === "string") || new Set(v).size !== v.length) return BAD;
  return v.every((id) => findGroup(sql, venueId, id)?.active === 1) ? v : BAD;
}

export function setItemGroups(sql: SqlStorage, venueId: string, menuItemId: string, groupIds: string[]): void {
  sql.exec("DELETE FROM menu_item_option_groups WHERE menu_item_id = ?", menuItemId);
  groupIds.forEach((groupId, i) =>
    sql.exec("INSERT INTO menu_item_option_groups (venue_id, menu_item_id, group_id, sort_order) VALUES (?, ?, ?, ?)", venueId, menuItemId, groupId, i),
  );
}

export function groupIdsOfItem(sql: SqlStorage, menuItemId: string): string[] {
  return sql
    .exec<{ group_id: string }>("SELECT group_id FROM menu_item_option_groups WHERE menu_item_id = ? ORDER BY sort_order", menuItemId)
    .toArray()
    .map((r) => r.group_id);
}

// ---------- tablet download ----------

/** Active groups with their active options, without dashboard-only fields. */
export function tabletOptionGroups(sql: SqlStorage, venueId: string) {
  return sql
    .exec<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM option_groups WHERE venue_id = ? AND active = 1 ORDER BY sort_order, name_en`, venueId)
    .toArray()
    .map((g) => ({
      id: g.id,
      nameEn: g.name_en,
      nameAm: g.name_am,
      minChoices: g.min_choices,
      maxChoices: g.max_choices,
      sortOrder: g.sort_order,
      options: optionsOf(sql, g.id, true).map((o) => ({ id: o.id, nameEn: o.nameEn, nameAm: o.nameAm, extraSantim: o.extraSantim, sortOrder: o.sortOrder })),
    }));
}

/** Active group ids per item, in order (only groups the tablet knows about). */
export function activeGroupIdsOfItem(sql: SqlStorage, menuItemId: string): string[] {
  return sql
    .exec<{ group_id: string }>(
      `SELECT l.group_id FROM menu_item_option_groups l JOIN option_groups g ON g.id = l.group_id
        WHERE l.menu_item_id = ? AND g.active = 1 ORDER BY l.sort_order`,
      menuItemId,
    )
    .toArray()
    .map((r) => r.group_id);
}

// ---------- checking a round's options ----------

export interface ChosenOption {
  groupId: string;
  optionId: string;
  nameEn: string;
  nameAm: string | null;
  extraSantim: number;
}

export type LineOptions = { ok: true; chosen: ChosenOption[]; extraSantim: number; changed: boolean } | { ok: false };

/**
 * Check one order line's chosen options. A live round must be exactly right; a queued round is
 * never refused (D-77): unknown or removed options are dropped (not charged) and choice-count
 * problems are kept, and either way the line is flagged `changed` for the kitchen.
 */
export function checkLineOptions(sql: SqlStorage, venueId: string, menuItemId: string, optionIds: readonly string[], queued: boolean): LineOptions {
  const groups = new Map(
    sql
      .exec<GroupRow>(
        `SELECT g.id, g.name_en, g.name_am, g.min_choices, g.max_choices, g.sort_order, g.active
           FROM menu_item_option_groups l JOIN option_groups g ON g.id = l.group_id
          WHERE l.menu_item_id = ? AND g.active = 1`,
        menuItemId,
      )
      .toArray()
      .map((g) => [g.id, g]),
  );

  let changed = false;
  const chosen: ChosenOption[] = [];
  for (const optionId of optionIds) {
    const o = findOption(sql, venueId, optionId);
    if (o === null || o.active !== 1 || !groups.has(o.group_id)) {
      if (!queued) return { ok: false };
      changed = true; // dropped: not charged, the kitchen sees the flag
      continue;
    }
    chosen.push({ groupId: o.group_id, optionId: o.id, nameEn: o.name_en, nameAm: o.name_am, extraSantim: o.extra_santim });
  }

  for (const g of groups.values()) {
    const count = chosen.filter((c) => c.groupId === g.id).length;
    if (count < g.min_choices || count > g.max_choices) {
      if (!queued) return { ok: false };
      changed = true;
    }
  }
  return { ok: true, chosen, extraSantim: chosen.reduce((sum, c) => sum + c.extraSantim, 0), changed };
}
