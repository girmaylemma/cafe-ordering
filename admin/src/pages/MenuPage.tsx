import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { PRICE_PATTERN, changedFields, optionalText, optionalWholeNumber } from "../forms";
import { errorMessage, orderFormatMessage, priceFormatMessage, stationLabel } from "../texts";
import type { Category, Me, MenuItem, OptionGroup, Station } from "../types";
import { useLoad } from "../useLoad";

type CategoryPayload = { nameEn: string; nameAm: string | null; sortOrder: number };
type ItemPayload = {
  categoryId: string;
  nameEn: string;
  nameAm: string | null;
  price: string;
  stationId: Station;
  fasting: boolean;
  sortOrder: number;
  optionGroupIds: string[];
};

const emptyCategory = { nameEn: "", nameAm: "", sortOrder: "0" };
const emptyItem = { categoryId: "", nameEn: "", nameAm: "", price: "", stationId: "kitchen" as Station, fasting: false, sortOrder: "0", optionGroupIds: [] as string[] };

export function MenuPage(_props: { me: Me }) {
  const load = useCallback(async () => {
    const [{ categories }, { items }, { groups }] = await Promise.all([
      api<{ categories: Category[] }>("GET", "/categories"),
      api<{ items: MenuItem[] }>("GET", "/menu-items"),
      api<{ groups: OptionGroup[] }>("GET", "/option-groups"),
    ]);
    return { categories, items, groups };
  }, []);
  const { data, error: loadError, reload } = useLoad(load);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];
  const activeCategories = categories.filter((c) => c.active);
  const activeGroups = (data?.groups ?? []).filter((g) => g.active);

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  // ---------- categories ----------

  async function onSaveCategory(event: FormEvent) {
    event.preventDefault();
    const sortOrder = optionalWholeNumber(categoryForm.sortOrder, 0, 9999);
    if (sortOrder === undefined) return setError(orderFormatMessage);
    const payload: CategoryPayload = { nameEn: categoryForm.nameEn.trim(), nameAm: optionalText(categoryForm.nameAm), sortOrder: sortOrder ?? 0 };

    const editing = editingCategory;
    const done = editing === null
      ? await run(() => api("POST", "/categories", payload), `Category "${payload.nameEn}" was added.`)
      : await run(() => api("PATCH", `/categories/${encodeURIComponent(editing.id)}`, changedFields(categoryPayload(editing), payload)), "Category saved.");
    if (done) {
      setCategoryForm(emptyCategory);
      setEditingCategory(null);
    }
  }

  function onEditCategory(c: Category) {
    setEditingCategory(c);
    setCategoryForm({ nameEn: c.nameEn, nameAm: c.nameAm ?? "", sortOrder: String(c.sortOrder) });
  }

  function onToggleCategory(c: Category) {
    if (c.active) {
      const count = items.filter((i) => i.categoryId === c.id && i.active).length;
      if (!window.confirm(`Deactivate "${c.nameEn}"? Its ${count} active items disappear from the tablets too.`)) return;
    }
    void run(() => api("PATCH", `/categories/${encodeURIComponent(c.id)}`, { active: !c.active }), c.active ? `"${c.nameEn}" deactivated.` : `"${c.nameEn}" reactivated.`);
  }

  // ---------- items ----------

  async function onSaveItem(event: FormEvent) {
    event.preventDefault();
    const price = itemForm.price.trim();
    if (!PRICE_PATTERN.test(price)) return setError(priceFormatMessage);
    const sortOrder = optionalWholeNumber(itemForm.sortOrder, 0, 9999);
    if (sortOrder === undefined) return setError(orderFormatMessage);
    const payload: ItemPayload = {
      categoryId: itemForm.categoryId || activeCategories[0]?.id || "",
      nameEn: itemForm.nameEn.trim(),
      nameAm: optionalText(itemForm.nameAm),
      price, // text, never a number: money must not pass through a float (D-70)
      stationId: itemForm.stationId,
      fasting: itemForm.fasting,
      sortOrder: sortOrder ?? 0,
      // In the order the groups are listed (the order tablets show them).
      optionGroupIds: activeGroups.filter((g) => itemForm.optionGroupIds.includes(g.id)).map((g) => g.id),
    };

    const editing = editingItem;
    const done = editing === null
      ? await run(() => api("POST", "/menu-items", payload), `"${payload.nameEn}" was added.`)
      : await run(() => api("PATCH", `/menu-items/${encodeURIComponent(editing.id)}`, changedFields(itemPayload(editing), payload)), "Item saved.");
    if (done) {
      setItemForm(emptyItem);
      setEditingItem(null);
    }
  }

  function onEditItem(i: MenuItem) {
    setEditingItem(i);
    setItemForm({
      categoryId: i.categoryId ?? "",
      nameEn: i.nameEn,
      nameAm: i.nameAm ?? "",
      price: i.price,
      stationId: (i.stationId === "bar" ? "bar" : "kitchen") as Station,
      fasting: i.fasting,
      sortOrder: String(i.sortOrder),
      optionGroupIds: i.optionGroupIds,
    });
  }

  function onToggleSoldOut(i: MenuItem) {
    // No confirmation: it's quick to undo, and waiters see it within seconds (K-05).
    void run(() => api("PATCH", `/menu-items/${encodeURIComponent(i.id)}`, { soldOut: !i.soldOut }), i.soldOut ? `"${i.nameEn}" is back in stock.` : `"${i.nameEn}" is sold out.`);
  }

  function toggleGroup(id: string, on: boolean) {
    setItemForm({ ...itemForm, optionGroupIds: on ? [...itemForm.optionGroupIds, id] : itemForm.optionGroupIds.filter((g) => g !== id) });
  }

  function onToggleItem(i: MenuItem) {
    if (i.active && !window.confirm(`Deactivate "${i.nameEn}"? It disappears from the tablets. Old orders keep it.`)) return;
    void run(() => api("PATCH", `/menu-items/${encodeURIComponent(i.id)}`, { active: !i.active }), i.active ? `"${i.nameEn}" deactivated.` : `"${i.nameEn}" reactivated.`);
  }

  // Items grouped by category (inactive categories too, so nothing is hidden from the manager).
  const groups = [
    ...categories.map((c) => ({ id: c.id, title: c.nameEn, inactive: !c.active, items: items.filter((i) => i.categoryId === c.id) })),
    { id: "none", title: "No category", inactive: false, items: items.filter((i) => i.categoryId === null) },
  ].filter((g) => g.id !== "none" || g.items.length > 0);

  return (
    <section>
      <h2>Menu</h2>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      <h3>Categories</h3>
      <table data-testid="categories">
        <thead>
          <tr>
            <th>English</th>
            <th>Amharic</th>
            <th>Order</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className={c.active ? undefined : "inactive"}>
              <td>{c.nameEn}</td>
              <td>{c.nameAm ?? "—"}</td>
              <td>{c.sortOrder}</td>
              <td>{c.active ? "Active" : "Inactive"}</td>
              <td className="actions">
                <button type="button" onClick={() => onEditCategory(c)}>
                  Edit
                </button>
                <button type="button" className={c.active ? "danger" : undefined} onClick={() => onToggleCategory(c)}>
                  {c.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="card" onSubmit={onSaveCategory}>
        <h3>{editingCategory === null ? "Add a category" : `Edit "${editingCategory.nameEn}"`}</h3>
        <label htmlFor="cat-en">Category name (English)</label>
        <input id="cat-en" value={categoryForm.nameEn} onChange={(e) => setCategoryForm({ ...categoryForm, nameEn: e.target.value })} maxLength={60} required />
        <label htmlFor="cat-am">Category name (Amharic, optional)</label>
        <input id="cat-am" lang="am" value={categoryForm.nameAm} onChange={(e) => setCategoryForm({ ...categoryForm, nameAm: e.target.value })} maxLength={60} />
        <label htmlFor="cat-order">Category order</label>
        <input id="cat-order" inputMode="numeric" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: e.target.value })} />
        <div className="actions">
          <button type="submit">{editingCategory === null ? "Add category" : "Save changes"}</button>
          {editingCategory !== null && (
            <button type="button" onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3>Items</h3>
      {groups.map((g) => (
        <div key={g.id} data-testid={`items-${g.id}`}>
          <h4>
            {g.title}
            {g.inactive && " (category inactive: hidden on tablets)"}
          </h4>
          <table>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className={i.active ? undefined : "inactive"}>
                  <td>{i.nameEn}</td>
                  <td lang="am">{i.nameAm ?? "—"}</td>
                  <td>{`${i.price} ETB`}</td>
                  <td>{stationLabel[i.stationId] ?? i.stationId}</td>
                  <td>{i.fasting ? "Fasting" : ""}</td>
                  <td>{!i.active ? "Inactive" : i.soldOut ? "Sold out" : "Active"}</td>
                  <td className="actions">
                    <button type="button" onClick={() => onEditItem(i)}>
                      Edit
                    </button>
                    {i.active && (
                      <button type="button" onClick={() => onToggleSoldOut(i)}>
                        {i.soldOut ? "Back in stock" : "Mark sold out"}
                      </button>
                    )}
                    <button type="button" className={i.active ? "danger" : undefined} onClick={() => onToggleItem(i)}>
                      {i.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <form className="card" onSubmit={onSaveItem} noValidate>
        <h3>{editingItem === null ? "Add an item" : `Edit "${editingItem.nameEn}"`}</h3>
        <label htmlFor="item-category">Category</label>
        <select id="item-category" value={itemForm.categoryId || activeCategories[0]?.id || ""} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn}
            </option>
          ))}
        </select>
        <label htmlFor="item-en">Item name (English)</label>
        <input id="item-en" value={itemForm.nameEn} onChange={(e) => setItemForm({ ...itemForm, nameEn: e.target.value })} maxLength={60} required />
        <label htmlFor="item-am">Item name (Amharic, optional)</label>
        <input id="item-am" lang="am" value={itemForm.nameAm} onChange={(e) => setItemForm({ ...itemForm, nameAm: e.target.value })} maxLength={60} />
        <label htmlFor="item-price">Price (ETB)</label>
        <input id="item-price" inputMode="decimal" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required />
        <p className="hint">For example 180 or 42.50.</p>
        <label htmlFor="item-station">Station</label>
        <select id="item-station" value={itemForm.stationId} onChange={(e) => setItemForm({ ...itemForm, stationId: e.target.value as Station })}>
          <option value="kitchen">Kitchen</option>
          <option value="bar">Bar</option>
        </select>
        <label className="check" htmlFor="item-fasting">
          <input id="item-fasting" type="checkbox" checked={itemForm.fasting} onChange={(e) => setItemForm({ ...itemForm, fasting: e.target.checked })} />
          Fasting (ጾም)
        </label>
        {activeGroups.length > 0 && (
          <fieldset>
            <legend>Option groups</legend>
            {activeGroups.map((g) => (
              <label key={g.id} className="check" htmlFor={`item-group-${g.id}`}>
                <input id={`item-group-${g.id}`} type="checkbox" checked={itemForm.optionGroupIds.includes(g.id)} onChange={(e) => toggleGroup(g.id, e.target.checked)} />
                {g.nameEn}
              </label>
            ))}
          </fieldset>
        )}
        <label htmlFor="item-order">Item order</label>
        <input id="item-order" inputMode="numeric" value={itemForm.sortOrder} onChange={(e) => setItemForm({ ...itemForm, sortOrder: e.target.value })} />
        <div className="actions">
          <button type="submit">{editingItem === null ? "Add item" : "Save changes"}</button>
          {editingItem !== null && (
            <button type="button" onClick={() => { setEditingItem(null); setItemForm(emptyItem); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function categoryPayload(c: Category): CategoryPayload {
  return { nameEn: c.nameEn, nameAm: c.nameAm, sortOrder: c.sortOrder };
}

function itemPayload(i: MenuItem): ItemPayload {
  return {
    categoryId: i.categoryId ?? "",
    nameEn: i.nameEn,
    nameAm: i.nameAm,
    price: i.price,
    stationId: (i.stationId === "bar" ? "bar" : "kitchen") as Station,
    fasting: i.fasting,
    sortOrder: i.sortOrder,
    optionGroupIds: i.optionGroupIds,
  };
}
