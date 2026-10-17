"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { applyTheme, storedTheme, type Theme } from "@/lib/theme";

const OPTIONS: { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "system", label: "System", icon: Monitor },
  { theme: "light", label: "Light", icon: Sun },
  { theme: "dark", label: "Dark", icon: Moon },
];

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    // The saved choice lives in this browser's storage, so it's read after hydration.
    const timer = setTimeout(() => setTheme(storedTheme()), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-hairline bg-page p-1">
      {OPTIONS.map(({ theme: option, label, icon: Icon }) => (
        <button
          key={option}
          role="radio"
          aria-checked={theme === option}
          onClick={() => {
            applyTheme(option);
            setTheme(option);
          }}
          className={`press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
            theme === option ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Keeps the browser bar colour in step with a picked theme on every page load. */
export function ThemeSync() {
  useEffect(() => {
    const theme = storedTheme();
    if (theme !== "system") applyTheme(theme);
  }, []);
  return null;
}
