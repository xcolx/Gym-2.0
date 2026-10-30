import type { ReactNode } from "react";

export function LegalPage({ title, lastUpdated, children }: { title: string; lastUpdated?: string; children: ReactNode }) {
  return (
    <main className="screen mx-auto w-full max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+48px)] md:px-6">
      <h1 className="text-large-title font-bold">{title}</h1>
      {lastUpdated && <p className="mt-1 text-footnote text-secondary-label">Last updated: {lastUpdated}</p>}
      {children}
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 flex flex-col gap-3 text-body">
      <h2 className="text-title font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-headline font-semibold">{children}</h3>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-app underline-offset-2 hover:underline">
      {children}
    </a>
  );
}
