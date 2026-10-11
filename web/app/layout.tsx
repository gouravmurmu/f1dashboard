import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "F1 Race Intelligence", template: "%s · F1 Race Intelligence" },
  description: "Live race tracker, Monte Carlo race predictions, standings and Formula 1 history since 1950.",
};

export const viewport: Viewport = { themeColor: "#e10600" };

const NAV = [
  { href: "/", label: "Home" },
  { href: "/races", label: "Races" },
  { href: "/standings", label: "Standings" },
  { href: "/history", label: "History" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 bg-carbon text-white">
          <div className="h-1 bg-f1" />
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-black uppercase tracking-wide">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-f1 text-sm italic">F1</span>
              <span className="hidden sm:inline">Race <span className="text-f1">Intelligence</span></span>
            </Link>
            <div className="ml-auto flex gap-0.5 text-xs font-bold uppercase tracking-wide sm:gap-1 sm:text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 text-white/80 sm:px-3 hover:bg-white/10 hover:text-white">
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-muted">
          Data: OpenF1 (timing, positions) and Jolpica (results since 1950). Unofficial project, not associated with
          the Formula 1 companies.
        </footer>
      </body>
    </html>
  );
}
