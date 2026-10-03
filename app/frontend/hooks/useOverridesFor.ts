"use client";

import { useCallback, useState } from "react";

type Overrides<V> = Record<string, V>;

const NONE: Overrides<never> = {};

/**
 * Optimistic per-id overrides layered over server data. They belong to the
 * `base` they were made against: when fresh data arrives (a new `base`
 * identity) they drop away on their own, with no effect to clear them.
 */
export function useOverridesFor<V>(
  base: unknown,
): [Overrides<V>, (update: (prev: Overrides<V>) => Overrides<V>) => void] {
  const [state, setState] = useState<{ base: unknown; map: Overrides<V> }>(() => ({
    base,
    map: NONE,
  }));
  const overrides = state.base === base ? state.map : NONE;
  const update = useCallback(
    (fn: (prev: Overrides<V>) => Overrides<V>) =>
      setState((s) => ({ base, map: fn(s.base === base ? s.map : NONE) })),
    [base],
  );
  return [overrides, update];
}
