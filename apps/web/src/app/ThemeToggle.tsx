"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "dark" | "light") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button
      onClick={toggle}
      title="Cambiar tema"
      style={{
        position: "fixed", bottom: 16, right: 16, zIndex: 50, marginTop: 0,
        borderRadius: 999, width: 44, height: 44, fontSize: 18,
        background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
