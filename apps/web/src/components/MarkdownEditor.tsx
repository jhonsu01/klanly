"use client";
import { useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Editor de contenido con formato (Markdown) y vista previa.
 * Barra de herramientas que inserta la sintaxis en la posición del cursor,
 * para que el productor no necesite conocer Markdown.
 */
export default function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  /** Envuelve la selección (o inserta un ejemplo) con los marcadores dados. */
  const wrap = (before: string, after = "", sample = "texto") => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const sel = value.slice(start, end) || sample;
    const next = value.slice(0, start) + before + sel + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  /** Inserta al principio de la línea actual (encabezados, listas, citas). */
  const prefixLine = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos + prefix.length, pos + prefix.length); });
  };

  const askLink = (image = false) => {
    const url = (window.prompt(image ? "URL de la imagen (https://…)" : "URL del enlace (https://…)") || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { window.alert("La URL debe empezar por http:// o https://"); return; }
    const label = image
      ? (window.prompt("Descripción de la imagen (opcional)") || "imagen")
      : (window.prompt("Texto del enlace") || url);
    wrap(`${image ? "!" : ""}[${label}](${url})`, "", "");
  };

  const Tool = ({ t, title, onClick }: { t: string; title: string; onClick: () => void }) => (
    <button type="button" className="md-tool" title={title} onClick={onClick}>{t}</button>
  );

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        <Tool t="B" title="Negrita" onClick={() => wrap("**", "**", "negrita")} />
        <Tool t="I" title="Cursiva" onClick={() => wrap("*", "*", "cursiva")} />
        <Tool t="S" title="Tachado" onClick={() => wrap("~~", "~~", "tachado")} />
        <span className="md-sep" />
        <Tool t="H1" title="Título" onClick={() => prefixLine("# ")} />
        <Tool t="H2" title="Subtítulo" onClick={() => prefixLine("## ")} />
        <span className="md-sep" />
        <Tool t="•" title="Lista" onClick={() => prefixLine("- ")} />
        <Tool t="1." title="Lista numerada" onClick={() => prefixLine("1. ")} />
        <Tool t="❝" title="Cita" onClick={() => prefixLine("> ")} />
        <span className="md-sep" />
        <Tool t="🔗" title="Enlace externo" onClick={() => askLink(false)} />
        <Tool t="🖼" title="Imagen por URL" onClick={() => askLink(true)} />
        <Tool t="{ }" title="Código" onClick={() => wrap("`", "`", "código")} />
        <Tool t="—" title="Separador" onClick={() => onChange(value + "\n\n---\n\n")} />
        <button
          type="button"
          className={`md-tool md-preview-toggle${preview ? " active" : ""}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "✎ Editar" : "👁 Vista previa"}
        </button>
      </div>

      {preview ? (
        <div className="md-body md-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<p class='muted'>Nada que previsualizar todavía.</p>" }} />
      ) : (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          placeholder={placeholder ?? "Escribe el contenido. Puedes usar **negrita**, listas, enlaces e imágenes."}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <div className="muted" style={{ fontSize: 11.5 }}>
        Admite formato Markdown. Las imágenes y enlaces externos deben empezar por https://
      </div>
    </div>
  );
}
