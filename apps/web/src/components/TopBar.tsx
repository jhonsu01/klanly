import type { ReactNode } from "react";

/**
 * Barra de navegación superior.
 *
 * Sustituye los enlaces de texto subrayado tipo "← Volver" (se veían
 * anticuados) por una barra fija translúcida con un botón de retroceso en
 * forma de pastilla y espacio para acciones a la derecha.
 */
export default function TopBar({
  backHref,
  backLabel = "Volver",
  title,
  right,
}: {
  backHref: string;
  backLabel?: string;
  /** Título corto opcional que se muestra centrado en pantallas anchas */
  title?: string;
  right?: ReactNode;
}) {
  return (
    <div className="topbar">
      <a className="topbar-back" href={backHref}>
        <svg className="topbar-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="topbar-back-label">{backLabel}</span>
      </a>
      {title && <div className="topbar-title">{title}</div>}
      <div className="topbar-actions">{right}</div>
    </div>
  );
}
