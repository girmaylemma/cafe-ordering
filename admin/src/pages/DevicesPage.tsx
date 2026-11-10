import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { deviceStatusLabel, errorMessage, stationLabel } from "../texts";
import type { Device, Me, PairingCode, Station } from "../types";
import { useLoad } from "../useLoad";

/** "482913" -> "482 913": easier to read aloud and type on the tablet. */
const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function DevicesPage(_props: { me: Me }) {
  const loadDevices = useCallback(() => api<{ devices: Device[] }>("GET", "/devices"), []);
  const { data, error: loadError, reload } = useLoad(loadDevices);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ name: string; code: PairingCode } | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"waiter" | "station">("waiter");
  const [station, setStation] = useState<Station>("kitchen");

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const created = await api<{ device: Device; pairingCode: PairingCode }>("POST", "/devices", {
        name: name.trim(),
        kind,
        stationId: kind === "station" ? station : null,
      });
      setPairing({ name: created.device.name, code: created.pairingCode });
      setName("");
    });
  }

  function onNewCode(d: Device) {
    void run(async () => {
      const code = await api<PairingCode>("POST", `/devices/${encodeURIComponent(d.id)}/pairing-code`, {});
      setPairing({ name: d.name, code });
    });
  }

  function onRevoke(d: Device) {
    const question = `Revoke ${d.name}? It is signed out at once and this cannot be undone. To use it again, add it as a new tablet.`;
    if (!window.confirm(question)) return;
    void run(() => api("POST", `/devices/${encodeURIComponent(d.id)}/revoke`, {}));
  }

  return (
    <section>
      <h2>Tablets</h2>
      {loadError !== null && <p role="alert">{errorMessage(loadError)}</p>}
      {error !== null && <p role="alert">{error}</p>}

      {pairing !== null && (
        <div className="card pairing" role="status">
          <p>Pairing code for {pairing.name}:</p>
          <p className="code" data-testid="pairing-code">
            {formatCode(pairing.code.code)}
          </p>
          <p>
            Enter this code on the tablet within 10 minutes (until{" "}
            {new Date(pairing.code.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}). It works only once.
          </p>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data?.devices ?? []).map((d) => (
            <tr key={d.id} className={d.status === "revoked" ? "inactive" : undefined}>
              <td>{d.name}</td>
              <td>{d.kind === "station" ? `${stationLabel[d.stationId ?? ""] ?? d.stationId} station` : "Waiter tablet"}</td>
              <td>{deviceStatusLabel[d.status]}</td>
              <td className="actions">
                {d.status === "unpaired" && (
                  <button type="button" onClick={() => onNewCode(d)}>
                    New code
                  </button>
                )}
                {d.status !== "revoked" && (
                  <button type="button" className="danger" onClick={() => onRevoke(d)}>
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="card" onSubmit={onCreate}>
        <h3>Add a tablet</h3>
        <label htmlFor="device-name">Tablet name</label>
        <input id="device-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />

        <label htmlFor="device-kind">Type</label>
        <select id="device-kind" value={kind} onChange={(e) => setKind(e.target.value as "waiter" | "station")}>
          <option value="waiter">Waiter tablet</option>
          <option value="station">Kitchen/bar tablet</option>
        </select>

        {kind === "station" && (
          <>
            <label htmlFor="device-station">Station</label>
            <select id="device-station" value={station} onChange={(e) => setStation(e.target.value as Station)}>
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar</option>
            </select>
          </>
        )}

        <button type="submit">Add tablet</button>
      </form>
    </section>
  );
}
