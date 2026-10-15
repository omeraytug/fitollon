"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/training", label: "Training" },
  { href: "/chat", label: "Coach" },
  { href: "/settings", label: "Settings" },
];

function Links({ pathname }: { pathname: string | null }) {
  return LINKS.map((link) => {
    const active = pathname !== null && (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href));
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
  });
}

// The current URL is only known at request time on dynamic routes, so the highlight streams in.
function ActiveLinks() {
  return <Links pathname={usePathname()} />;
}

export function Nav() {
  return (
    <header className="border-b border-hairline bg-surface">
      <nav className="mx-auto flex max-w-5xl items-center gap-0.5 overflow-x-auto px-4 py-3 whitespace-nowrap sm:gap-1">
        <span className="mr-3 hidden font-semibold tracking-tight sm:inline">Fitollon</span>
        <Suspense fallback={<Links pathname={null} />}>
          <ActiveLinks />
        </Suspense>
      </nav>
    </header>
  );
}
