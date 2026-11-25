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
    </section>
  );
}
