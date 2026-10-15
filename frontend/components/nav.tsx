"use client";

import { CircleUser, ClipboardList, Dumbbell, House, MessageCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/logo";

type Tab = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    icon: House,
    match: (p) => p === "/" || ["/weight", "/nutrition", "/steps"].some((h) => p.startsWith(h)),
  },
  {
    href: "/training",
    label: "Training",
    icon: Dumbbell,
    match: (p) => p.startsWith("/training") && !p.startsWith("/training/program"),
  },
  { href: "/training/program", label: "Program", icon: ClipboardList, match: (p) => p.startsWith("/training/program") },
  { href: "/chat", label: "Coach", icon: MessageCircle, match: (p) => p.startsWith("/chat") },
];

function ProfileButton({ active }: { active: boolean }) {
  return (
    <Link
      href="/profile"
      aria-label="Profile"
      className={`press grid size-9 place-items-center rounded-full ${active ? "bg-accent-wash text-accent" : "text-ink-2 hover:text-ink"}`}
    >
      <CircleUser size={24} strokeWidth={1.75} />
    </Link>
  );
}

function Bars({ pathname }: { pathname: string | null }) {
  const path = pathname ?? "";
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur-md">
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2">
          <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7" />
            Fitollon
          </Link>
          <div className="hidden flex-1 items-center gap-1 sm:flex">
            {TABS.map((tab) => {
              const active = tab.match(path);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                    active ? "bg-accent-wash font-medium text-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <tab.icon size={16} strokeWidth={active ? 2.25 : 1.75} className={active ? "text-accent" : undefined} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto">
            <ProfileButton active={path.startsWith("/profile")} />
          </div>
        </nav>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid h-(--tabbar-h) grid-cols-4 border-t border-hairline bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {TABS.map((tab) => {
          const active = tab.match(path);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`press flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-medium text-accent" : "text-muted"}`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-colors duration-300 ${active ? "bg-accent-wash" : ""}`}
              >
                <tab.icon size={21} strokeWidth={active ? 2.25 : 1.75} />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

// The current URL is only known at request time on dynamic routes, so the highlight streams in.
function ActiveBars() {
  return <Bars pathname={usePathname()} />;
}

export function Nav() {
  return (
    <Suspense fallback={<Bars pathname={null} />}>
      <ActiveBars />
    </Suspense>
  );
}
