import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { DevicesPage } from "./pages/DevicesPage";
import { MenuPage } from "./pages/MenuPage";
import { OptionsPage } from "./pages/OptionsPage";
import { StaffPage } from "./pages/StaffPage";
import { TablesPage } from "./pages/TablesPage";
import { errorMessage, noAccessMessage, roleLabel } from "./texts";
import type { Me } from "./types";
import { useLoad } from "./useLoad";

const PAGES = [
  { id: "staff", label: "Staff" },
  { id: "tablets", label: "Tablets" },
  { id: "menu", label: "Menu" },
  { id: "options", label: "Options" },
  { id: "tables", label: "Tables" },
] as const;
type PageId = (typeof PAGES)[number]["id"];

/** The page lives in the address (#staff, #tablets), so reload and the back button work. */
function pageFromHash(): PageId {
  const id = window.location.hash.slice(1);
  return PAGES.some((p) => p.id === id) ? (id as PageId) : "staff";
}

export function App() {
  const loadMe = useCallback(() => api<Me>("GET", "/me"), []);
  const { data: me, error } = useLoad(loadMe);
  const [page, setPage] = useState<PageId>(pageFromHash);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (error !== null) {
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <main className="centered">
        <p role="alert">{forbidden ? noAccessMessage : errorMessage(error)}</p>
      </main>
    );
  }
  if (me === null) return <main className="centered">Loading…</main>;

  const go = (id: PageId) => {
    window.location.hash = id;
    setPage(id);
  };

  return (
    <>
      <header className="topbar">
        <h1>{me.venue.name ?? "Café"}</h1>
        <span className="who">{`${me.user.name} (${roleLabel[me.user.role]?.toLowerCase() ?? me.user.role})`}</span>
      </header>
      <nav className="tabs">
        {PAGES.map((p) => (
          <button key={p.id} type="button" className={p.id === page ? "tab active" : "tab"} onClick={() => go(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>
      <main>
        {page === "staff" && <StaffPage me={me} />}
        {page === "tablets" && <DevicesPage me={me} />}
        {page === "menu" && <MenuPage me={me} />}
        {page === "options" && <OptionsPage me={me} />}
        {page === "tables" && <TablesPage me={me} />}
      </main>
    </>
  );
}
