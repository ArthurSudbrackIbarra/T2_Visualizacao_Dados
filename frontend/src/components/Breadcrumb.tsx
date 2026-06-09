import type { Nav, View } from "../types";

interface Props {
  nav: Nav;
  onNavigate: (view: View) => void;
}

// Brasil > Paraná > Curitiba — each crumb returns to that level.
export default function Breadcrumb({ nav, onNavigate }: Props) {
  return (
    <nav className="breadcrumb" aria-label="Nível de navegação">
      <button
        className={nav.view === "national" ? "crumb on" : "crumb"}
        onClick={() => onNavigate("national")}
      >
        Brasil
      </button>

      {nav.state && (
        <>
          <span className="sep">›</span>
          <button
            className={nav.view === "state" ? "crumb on" : "crumb"}
            onClick={() => onNavigate("state")}
          >
            {nav.state.name}
          </button>
        </>
      )}

      {nav.city && (
        <>
          <span className="sep">›</span>
          <button className="crumb on" onClick={() => onNavigate("city")}>
            {nav.city.name}
          </button>
        </>
      )}
    </nav>
  );
}
