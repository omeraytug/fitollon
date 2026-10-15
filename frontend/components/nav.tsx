"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Coach" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="border-b border-hairline bg-surface">
      <nav className="mx-auto flex max-w-5xl items-center gap-0.5 px-4 py-3 sm:gap-1">
        <span className="mr-1 font-semibold tracking-tight sm:mr-3">Fitollon</span>
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-2 py-1.5 text-sm sm:px-3 ${
                active ? "bg-accent-wash font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <button onClick={logout} className="ml-auto text-sm whitespace-nowrap text-muted hover:text-ink">
          Log out
        </button>
      </nav>
    </header>
  );
}
