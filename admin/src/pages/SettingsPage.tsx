import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { errorMessage, languageOption } from "../texts";
import { LANGUAGES, type Language, type Me, type Venue } from "../types";
import { useLoad } from "../useLoad";

/**
 * Café settings (F4c). Only the café language for now; VAT, service charge and the business day
 * join this page later (design spec 5.3). Only managers reach the dashboard at all.
 */
export function SettingsPage(_props: { me: Me }) {
  const loadVenue = useCallback(() => api<{ venue: Venue }>("GET", "/venue"), []);
  const { data, error: loadError } = useLoad(loadVenue);
  const [saved, setSaved] = useState<Language | null>(null); // the language the server has now
  const [language, setLanguage] = useState<Language | null>(null); // the one chosen on screen
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data === null) return;
    setSaved(data.venue.language);
    setLanguage(data.venue.language);
  }, [data]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (language === null) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const { venue } = await api<{ venue: Venue }>("PATCH", "/venue", { language });
      setSaved(venue.language);
      setNotice("Saved. Tablets switch the next time they start or reconnect.");
    } catch (e) {
      setError(errorMessage(e)); // the choice stays on screen, to try again
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2>Settings</h2>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}

      {language !== null && (
        <form className="card" onSubmit={onSave}>
          <label htmlFor="cafe-language">Café language</label>
          <select id="cafe-language" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {languageOption[l]}
              </option>
            ))}
          </select>
          <p className="hint">
            The PIN screen and kitchen tablets use it, and every waiter who has not chosen their own language on the tablet.
          </p>
          <button type="submit" disabled={saving || language === saved}>
            Save
          </button>
        </form>
      )}
      <PasswordCard />
    </section>
  );
}

/** 10 to 128 characters, counted like the server (code points). */
const longEnough = (password: string) => [...password].length >= 10;

/**
 * The manager's own password (M1b, D-99): it unlocks the app's management screens (M2). Set here
 * until the developer console exists (M4). Passwords never stay on screen after a save or refusal.
 */
function PasswordCard() {
  // Asked fresh from the server, not taken from the "me" loaded when the dashboard opened: that copy
  // goes stale once a password is set (bug: Current password was hidden although one existed).
  const loadMe = useCallback(() => api<Me>("GET", "/me"), []);
  const { data: me, error: loadError } = useLoad(loadMe);
  const [saved, setSaved] = useState(false); // set or changed since the card opened
  const hasPassword = saved || me?.user.hasPassword === true;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const kind = show ? "text" : "password";
  const typed = [...next].length;

  function clear() {
    setCurrent("");
    setNext("");
    setAgain("");
    setShow(false); // hidden again: never leave a password visible
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (next !== again) {
      setError("The two passwords are not the same.");
      return;
    }
    setSaving(true);
    try {
      await api("PUT", "/me/password", hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next });
      setSaved(true);
      setNotice("Your password is saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      clear(); // never leave a password on screen, whatever happened
      setSaving(false);
    }
  }

  if (loadError !== null) return <p role="alert">{errorMessage(loadError)}</p>;
  if (me === null) return null; // a moment, until the server says whether a password exists
  return (
    <form className="card" onSubmit={onSave}>
      <h3>Your password</h3>
      <p className="hint">At least 10 characters. You will use it to open the management screens in the app.</p>
      {error !== null && <p role="alert">{error}</p>}
      {notice !== null && <p role="status">{notice}</p>}
      {hasPassword && (
        <>
          <label htmlFor="password-current">Current password</label>
          <input id="password-current" type={kind} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </>
      )}
      <label htmlFor="password-new">New password</label>
      <input id="password-new" type={kind} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      {typed > 0 && typed < 10 && <p className="hint">{`At least 10 characters (${typed} so far).`}</p>}
      <label htmlFor="password-again">New password again</label>
      <input id="password-again" type={kind} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      <label className="check" htmlFor="password-show">
        <input id="password-show" type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      <button type="submit" disabled={saving || !longEnough(next) || !longEnough(again)}>
        Save password
      </button>
    </form>
  );
}
