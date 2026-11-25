import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { errorMessage, languageName, roleLabel } from "../texts";
import { canManage, type Me, type Staff } from "../types";
import { useLoad } from "../useLoad";

export function StaffPage({ me }: { me: Me }) {
  const loadStaff = useCallback(() => api<{ staff: Staff[] }>("GET", "/staff"), []);
  const { data, error: loadError, reload } = useLoad(loadStaff);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");


  async function run(action: () => Promise<unknown>, success: string | null) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success !== null) setNotice(success);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    // Managers add waiters only; managers are added by the developer (D-97). The server enforces it too.
    const body = { name: name.trim(), role: "waiter", pin, email: email.trim() === "" ? null : email.trim() };
    setPin(""); // never leave a PIN on screen, whatever happens
    await run(async () => {
      await api("POST", "/staff", body);
      setName("");
      setEmail("");
    }, `${body.name} was added.`);
  }

  function onDeactivate(s: Staff) {
    if (!window.confirm(`Deactivate ${s.name}? They are signed out of every tablet and the dashboard at once.`)) return;
    void run(() => api("POST", `/staff/${encodeURIComponent(s.id)}/deactivate`, {}), `${s.name} was deactivated.`);
  }

  function onResetPin(s: Staff) {
    const digits = s.role === "waiter" ? "4–6 digits" : "exactly 6 digits";
    const newPin = window.prompt(`New PIN for ${s.name} (${digits}). This also unlocks a locked account.`);
    if (newPin === null) return;
    void run(() => api("POST", `/staff/${encodeURIComponent(s.id)}/pin`, { pin: newPin.trim() }), `PIN changed for ${s.name}.`);
  }

  return (
    <section>
      <h2>Staff</h2>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Language</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data?.staff ?? []).map((s) => {
            const manageable = s.active && canManage(me.user.role, s.role);
            return (
              <tr key={s.id} className={s.active ? undefined : "inactive"}>
                <td>{s.name}</td>
                <td>{roleLabel[s.role]}</td>
                <td>{s.email ?? "—"}</td>
                {/* Chosen by the person on the tablet; read-only here (F4c). */}
                <td>{s.language == null ? "Café default" : (languageName[s.language] ?? s.language)}</td>
                <td>{s.active ? "Active" : "Inactive"}</td>
                <td className="actions">
                  {manageable && (
                    <button type="button" onClick={() => onResetPin(s)}>
                      Reset PIN
                    </button>
                  )}
                  {manageable && s.id !== me.user.id && (
                    <button type="button" className="danger" onClick={() => onDeactivate(s)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form className="card" onSubmit={onCreate}>
        <h3>Add a staff member</h3>
        <p className="hint">New staff are waiters. Managers are added by the system's developer.</p>
        <label htmlFor="staff-name">Name</label>
        <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />

        <label htmlFor="staff-pin">PIN</label>
        <input
          id="staff-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          pattern="\d{4,6}"
          required
        />
        <p className="hint">4–6 digits.</p>

        <label htmlFor="staff-email">Email (optional)</label>
        <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="hint">Optional: waiters do not use this dashboard.</p>

        <button type="submit">Add staff member</button>
      </form>
    </section>
  );
}
