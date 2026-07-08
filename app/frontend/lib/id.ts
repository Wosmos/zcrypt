/**
 * Monotonic client-side id generator with a module-scoped counter, folding the
 * `${prefix}_${++counter}_${Date.now()}` ids hand-rolled across the toast,
 * notification, download, and upload stores.
 *
 * The counter guarantees uniqueness even within the same millisecond; the
 * timestamp keeps ids sortable/debuggable. Pass `{ time: false }` for the
 * toast-style `${prefix}_${counter}` form (no timestamp).
 */
let counter = 0;

export function genId(prefix: string, opts?: { time?: boolean }): string {
  const n = ++counter;
  return opts?.time === false ? `${prefix}_${n}` : `${prefix}_${n}_${Date.now()}`;
}
