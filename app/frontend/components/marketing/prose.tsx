// Shared prose primitives for the long-form marketing pages (terms, privacy,
// philosophy) so they stay visually consistent instead of each redefining these.
// The scroll-reveal <Section> lives in ./section-reveal (client island) so
// these stay plain server-rendered markup.

export function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-12 border-l-2 border-cyan-500/40 pl-6 py-2">
      <p className="text-xl sm:text-2xl font-medium italic text-[var(--color-text)] leading-relaxed">
        {children}
      </p>
    </blockquote>
  );
}

export function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2 text-base text-[var(--color-text-secondary)] leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-cyan-500 mt-0.5 shrink-0">&bull;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
