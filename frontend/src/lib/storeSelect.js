/**
 * A readable of `selector(state)` that notifies its subscribers only when the
 * selected value changes, so a component can follow one part of a store
 * without updating on every other change.
 */
export function select(store, selector) {
  return {
    subscribe(run) {
      let first = true;
      let last;
      return store.subscribe((state) => {
        const value = selector(state);
        if (first || value !== last) {
          first = false;
          last = value;
          run(value);
        }
      });
    },
  };
}
