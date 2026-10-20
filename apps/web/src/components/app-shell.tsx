import { Database, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "./nav-link";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="border-b bg-sidebar md:min-h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">AI</span>
          </div>
          <div>
            <p className="text-sm font-semibold">AI BI</p>
            <p className="text-xs text-muted-foreground">Analytics workspace</p>
          </div>
        </div>
        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0"
        >
          <NavLink href="/source" icon={<Database className="size-4" />}>
            Source
          </NavLink>
          <NavLink href="/metadata" icon={<Table2 className="size-4" />}>
            Metadata
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
