import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { errorMessage, roleLabel } from "../texts";
import { canManage, type Me, type Role, type Staff } from "../types";
import { useLoad } from "../useLoad";

export function StaffPage({ me }: { me: Me }) {
  const loadStaff = useCallback(() => api<{ staff: Staff[] }>("GET", "/staff"), []);
  const { data, error: loadError, reload } = useLoad(loadStaff);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");

  // Managers can't create owners (design §2); the server enforces it too.
  const roles: Role[] = me.user.role === "owner" ? ["waiter", "manager", "owner"] : ["waiter", "manager"];

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
    const body = { name: name.trim(), role, pin, email: email.trim() === "" ? null : email.trim() };
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
        <label htmlFor="staff-name">Name</label>
        <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />

        <label htmlFor="staff-role">Role</label>
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>

        <label htmlFor="staff-pin">PIN</label>
        <input
          id="staff-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          pattern={role === "waiter" ? "\\d{4,6}" : "\\d{6}"}
          required
        />
        <p className="hint">{role === "waiter" ? "4–6 digits." : "Exactly 6 digits: this PIN approves voids."}</p>

        <label htmlFor="staff-email">Email (optional)</label>
        <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="hint">Managers and owners need an email to sign in to this dashboard.</p>

        <button type="submit">Add staff member</button>
      </form>
    </section>
  );
}
