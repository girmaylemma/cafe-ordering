import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { PRICE_PATTERN, changedFields, optionalText, optionalWholeNumber } from "../forms";
import { errorMessage, minMaxMessage, priceFormatMessage } from "../texts";
import type { Me, OptionChoice, OptionGroup } from "../types";
import { useLoad } from "../useLoad";

type GroupPayload = { nameEn: string; nameAm: string | null; minChoices: number; maxChoices: number };
const emptyGroup = { nameEn: "", nameAm: "", min: "0", max: "1" };
const emptyOption = { nameEn: "", nameAm: "", extra: "0" };

/** The group's rule in plain words, as the waiter will experience it. */
export function ruleText(min: number, max: number): string {
  if (min === max) return `Choose exactly ${min}`;
  if (min === 0) return `Optional: up to ${max}`;
  return `Choose ${min} to ${max}`;
}

const extraText = (o: OptionChoice) => (o.extraSantim === 0 ? "free" : `+${o.extra} ETB`);

export function OptionsPage(_props: { me: Me }) {
  const load = useCallback(() => api<{ groups: OptionGroup[] }>("GET", "/option-groups"), []);
  const { data, error: loadError, reload } = useLoad(load);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [editing, setEditing] = useState<OptionGroup | null>(null);
  const [optionForms, setOptionForms] = useState<Record<string, typeof emptyOption>>({});

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

  async function onSaveGroup(event: FormEvent) {
    event.preventDefault();
    const min = optionalWholeNumber(groupForm.min, 0, 10);
    const max = optionalWholeNumber(groupForm.max, 1, 10);
    if (min === undefined || min === null || max === undefined || max === null || min > max) return setError(minMaxMessage);
    const payload: GroupPayload = { nameEn: groupForm.nameEn.trim(), nameAm: optionalText(groupForm.nameAm), minChoices: min, maxChoices: max };

    const current = editing;
    const done = current === null
      ? await run(() => api("POST", "/option-groups", payload), `Group "${payload.nameEn}" was added.`)
      : await run(
          () => api("PATCH", `/option-groups/${encodeURIComponent(current.id)}`, changedFields({ nameEn: current.nameEn, nameAm: current.nameAm, minChoices: current.minChoices, maxChoices: current.maxChoices }, payload)),
          "Group saved.",
        );
    if (done) {
      setGroupForm(emptyGroup);
      setEditing(null);
    }
  }

  function onEditGroup(g: OptionGroup) {
    setEditing(g);
    setGroupForm({ nameEn: g.nameEn, nameAm: g.nameAm ?? "", min: String(g.minChoices), max: String(g.maxChoices) });
  }

  function onToggleGroup(g: OptionGroup) {
    if (g.active && !window.confirm(`Deactivate "${g.nameEn}"? Items using it stop offering these choices on the tablets.`)) return;
    void run(() => api("PATCH", `/option-groups/${encodeURIComponent(g.id)}`, { active: !g.active }), g.active ? `"${g.nameEn}" deactivated.` : `"${g.nameEn}" reactivated.`);
  }

  const optionForm = (groupId: string) => optionForms[groupId] ?? emptyOption;
  const setOptionForm = (groupId: string, value: typeof emptyOption) => setOptionForms({ ...optionForms, [groupId]: value });

  async function onAddOption(event: FormEvent, g: OptionGroup) {
    event.preventDefault();
    const form = optionForm(g.id);
    const extra = form.extra.trim() === "" ? "0" : form.extra.trim();
    if (!PRICE_PATTERN.test(extra)) return setError(priceFormatMessage);
    const payload = { nameEn: form.nameEn.trim(), nameAm: optionalText(form.nameAm), extra }; // extra as text (D-70)
    if (await run(() => api("POST", `/option-groups/${encodeURIComponent(g.id)}/options`, payload), `"${payload.nameEn}" was added to ${g.nameEn}.`)) {
      setOptionForm(g.id, emptyOption);
    }
  }

  function onToggleOption(o: OptionChoice) {
    if (o.active && !window.confirm(`Deactivate "${o.nameEn}"? Tablets stop offering it; orders already sent keep it.`)) return;
    void run(() => api("PATCH", `/options/${encodeURIComponent(o.id)}`, { active: !o.active }), o.active ? `"${o.nameEn}" deactivated.` : `"${o.nameEn}" reactivated.`);
  }

  return (
    <section>
      <h2>Options</h2>
      <p className="hint">Groups like “Size” or “Extras”. Attach them to menu items on the Menu page.</p>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      {(data?.groups ?? []).map((g) => {
        const form = optionForm(g.id);
        return (
          <div key={g.id} className={g.active ? "card wide" : "card wide inactive"} data-testid={`group-${g.id}`}>
            <h3>
              {g.nameEn}
              {g.nameAm !== null && <span lang="am"> · {g.nameAm}</span>}
              {!g.active && " (inactive)"}
            </h3>
            <p className="hint">{ruleText(g.minChoices, g.maxChoices)}</p>
            <div className="actions">
              <button type="button" onClick={() => onEditGroup(g)}>
                Edit group
              </button>
              <button type="button" className={g.active ? "danger" : undefined} onClick={() => onToggleGroup(g)}>
                {g.active ? "Deactivate group" : "Reactivate group"}
              </button>
            </div>

            <table>
              <tbody>
                {g.options.map((o) => (
                  <tr key={o.id} className={o.active ? undefined : "inactive"}>
                    <td>{o.nameEn}</td>
                    <td lang="am">{o.nameAm ?? "—"}</td>
                    <td>{extraText(o)}</td>
                    <td>{o.active ? "Active" : "Inactive"}</td>
                    <td className="actions">
                      <button type="button" className={o.active ? "danger" : undefined} onClick={() => onToggleOption(o)}>
                        {o.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form className="inline-form" onSubmit={(e) => void onAddOption(e, g)} noValidate>
              <label htmlFor={`opt-en-${g.id}`}>New option (English)</label>
              <input id={`opt-en-${g.id}`} value={form.nameEn} onChange={(e) => setOptionForm(g.id, { ...form, nameEn: e.target.value })} maxLength={60} required />
              <label htmlFor={`opt-am-${g.id}`}>Amharic (optional)</label>
              <input id={`opt-am-${g.id}`} lang="am" value={form.nameAm} onChange={(e) => setOptionForm(g.id, { ...form, nameAm: e.target.value })} maxLength={60} />
              <label htmlFor={`opt-extra-${g.id}`}>Extra (ETB)</label>
              <input id={`opt-extra-${g.id}`} inputMode="decimal" value={form.extra} onChange={(e) => setOptionForm(g.id, { ...form, extra: e.target.value })} />
              <button type="submit">Add option</button>
            </form>
          </div>
        );
      })}

      <form className="card" onSubmit={onSaveGroup} noValidate>
        <h3>{editing === null ? "Add an option group" : `Edit "${editing.nameEn}"`}</h3>
        <label htmlFor="group-en">Group name (English)</label>
        <input id="group-en" value={groupForm.nameEn} onChange={(e) => setGroupForm({ ...groupForm, nameEn: e.target.value })} maxLength={60} required />
        <label htmlFor="group-am">Group name (Amharic, optional)</label>
        <input id="group-am" lang="am" value={groupForm.nameAm} onChange={(e) => setGroupForm({ ...groupForm, nameAm: e.target.value })} maxLength={60} />
        <label htmlFor="group-min">At least</label>
        <input id="group-min" inputMode="numeric" value={groupForm.min} onChange={(e) => setGroupForm({ ...groupForm, min: e.target.value })} />
        <label htmlFor="group-max">At most</label>
        <input id="group-max" inputMode="numeric" value={groupForm.max} onChange={(e) => setGroupForm({ ...groupForm, max: e.target.value })} />
        <p className="hint">“At least 1, at most 1” = the waiter must choose one (like a size).</p>
        <div className="actions">
          <button type="submit">{editing === null ? "Add group" : "Save changes"}</button>
          {editing !== null && (
            <button type="button" onClick={() => { setEditing(null); setGroupForm(emptyGroup); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
