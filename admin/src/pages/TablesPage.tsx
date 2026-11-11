import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { changedFields, optionalText, optionalWholeNumber } from "../forms";
import { errorMessage, orderFormatMessage, seatsFormatMessage } from "../texts";
import type { CafeTable, Me } from "../types";
import { useLoad } from "../useLoad";

type TablePayload = { name: string; area: string | null; seats: number | null; sortOrder: number };
const empty = { name: "", area: "", seats: "", sortOrder: "0" };

export function TablesPage(_props: { me: Me }) {
  const load = useCallback(() => api<{ tables: CafeTable[] }>("GET", "/tables"), []);
  const { data, error: loadError, reload } = useLoad(load);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<CafeTable | null>(null);

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

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const seats = optionalWholeNumber(form.seats, 1, 99);
    if (seats === undefined) return setError(seatsFormatMessage);
    const sortOrder = optionalWholeNumber(form.sortOrder, 0, 9999);
    if (sortOrder === undefined) return setError(orderFormatMessage);
    const payload: TablePayload = { name: form.name.trim(), area: optionalText(form.area), seats, sortOrder: sortOrder ?? 0 };

    const current = editing;
    const done = current === null
      ? await run(() => api("POST", "/tables", payload), `"${payload.name}" was added.`)
      : await run(() => api("PATCH", `/tables/${encodeURIComponent(current.id)}`, changedFields(asPayload(current), payload)), "Table saved.");
    if (done) {
      setForm(empty);
      setEditing(null);
    }
  }

  function onEdit(t: CafeTable) {
    setEditing(t);
    setForm({ name: t.name, area: t.area ?? "", seats: t.seats === null ? "" : String(t.seats), sortOrder: String(t.sortOrder) });
  }

  function onToggle(t: CafeTable) {
    if (t.active && !window.confirm(`Deactivate "${t.name}"? It disappears from the tablets' floor map.`)) return;
    void run(() => api("PATCH", `/tables/${encodeURIComponent(t.id)}`, { active: !t.active }), t.active ? `"${t.name}" deactivated.` : `"${t.name}" reactivated.`);
  }

  return (
    <section>
      <h2>Tables</h2>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Area</th>
            <th>Seats</th>
            <th>Order</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data?.tables ?? []).map((t) => (
            <tr key={t.id} className={t.active ? undefined : "inactive"}>
              <td>{t.name}</td>
              <td>{t.area ?? "—"}</td>
              <td>{t.seats ?? "—"}</td>
              <td>{t.sortOrder}</td>
              <td>{t.active ? "Active" : "Inactive"}</td>
              <td className="actions">
                <button type="button" onClick={() => onEdit(t)}>
                  Edit
                </button>
                <button type="button" className={t.active ? "danger" : undefined} onClick={() => onToggle(t)}>
                  {t.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="card" onSubmit={onSave} noValidate>
        <h3>{editing === null ? "Add a table" : `Edit "${editing.name}"`}</h3>
        <label htmlFor="table-name">Table name</label>
        <input id="table-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} required />
        <label htmlFor="table-area">Area (optional)</label>
        <input id="table-area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} maxLength={30} />
        <label htmlFor="table-seats">Seats (optional)</label>
        <input id="table-seats" inputMode="numeric" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
        <label htmlFor="table-order">Table order</label>
        <input id="table-order" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
        <div className="actions">
          <button type="submit">{editing === null ? "Add table" : "Save changes"}</button>
          {editing !== null && (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function asPayload(t: CafeTable): TablePayload {
  return { name: t.name, area: t.area, seats: t.seats, sortOrder: t.sortOrder };
}
