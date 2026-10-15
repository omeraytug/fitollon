import { ViewTransition } from "react";

import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <ViewTransition>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-5 pb-[calc(var(--tabbar-h)+1.5rem)] sm:pt-8">
          {children}
        </main>
      </ViewTransition>
    </>
  );
}
