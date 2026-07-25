"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Visor de imágenes a pantalla completa con zoom (comprobantes de pago).
 *
 * Antes el comprobante era un enlace `target="_blank"`: eso no funciona dentro
 * de la app de escritorio (Tauri) ni del WebView de Android porque no hay
 * navegador donde abrir la pestaña. Este visor es un overlay dentro de la
 * propia app, con zoom por pinza, rueda del ratón y botones, y arrastre para
 * moverse por la imagen.
 */
export default function ImageViewer({ src, alt = "comprobante", onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Cerrar con Escape y bloquear el scroll del fondo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(6, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(0.5, z - 0.25));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const clampZoom = (z: number) => Math.max(0.5, Math.min(6, z));

  const dist = (t: { [i: number]: { clientX: number; clientY: number } }) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };

  return (
    <div className="iv-overlay" onClick={onClose}>
      <div className="iv-bar" onClick={(e) => e.stopPropagation()}>
        <button className="ghost" onClick={() => setZoom((z) => clampZoom(z - 0.25))} title="Alejar">−</button>
        <span className="iv-pct">{Math.round(zoom * 100)}%</span>
        <button className="ghost" onClick={() => setZoom((z) => clampZoom(z + 0.25))} title="Acercar">+</button>
        <button className="ghost" onClick={reset} title="Tamaño original">Ajustar</button>
        <a href={src} download={`comprobante.jpg`} onClick={(e) => e.stopPropagation()}>
          <button className="ghost" title="Descargar">⤓</button>
        </a>
        <button className="ghost" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div
        className="iv-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => { e.preventDefault(); setZoom((z) => clampZoom(z - e.deltaY * 0.002)); }}
        onDoubleClick={() => (zoom > 1 ? reset() : setZoom(2))}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
        onTouchStart={(e) => { if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), zoom }; }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            e.preventDefault();
            setZoom(clampZoom(pinch.current.zoom * (dist(e.touches) / pinch.current.dist)));
          }
        }}
        onTouchEnd={() => { pinch.current = null; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
      </div>

      <div className="iv-hint">Pellizca para acercar · arrastra para mover · doble toque para ajustar</div>
    </div>
  );
}
