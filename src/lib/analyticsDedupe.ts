/**
 * Per-key "fire once" for the analytics session: `now` fires on the first call for a key, `settle`
 * fires only after calls for a key have stopped for `settleMs` (a drag or slider burst), and both
 * never fire a key twice. Timers are injectable so the tests can drive them.
 */
export function createOncePerKey(
  settleMs: number,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
) {
  const fired = new Set<string>();
  const pending = new Map<string, unknown>();

  const fire = (key: string, fn: () => void) => {
    if (fired.has(key)) return;
    fired.add(key);
    fn();
  };

  return {
    has: (key: string) => fired.has(key),
    now: fire,
    settle(key: string, fn: () => void) {
      if (fired.has(key)) return;
      if (pending.has(key)) timers.clear(pending.get(key));
      pending.set(
        key,
        timers.set(() => {
          pending.delete(key);
          fire(key, fn);
        }, settleMs)
      );
    },
  };
}
