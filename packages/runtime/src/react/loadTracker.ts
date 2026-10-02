/** counts in-flight asset loads (textures, glbs, fonts, env maps) per mount */
export type LoadTracker = {
  /** take a token; call the returned fn once when that load settles (ok or failed) */
  begin(): () => void;
  /** fires `onSettled` once, as soon as nothing is pending */
  arm(onSettled: () => void): void;
  disarm(): void;
};

export function createLoadTracker(): LoadTracker {
  let pending = 0;
  let fired = false;
  let listener: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    if (timer !== null || fired || !listener || pending > 0) return;
    // deferred: a suspense handoff releases one token + takes the next in a
    // single commit — a sync check would see a false zero in between
    timer = setTimeout(() => {
      timer = null;
      if (fired || !listener || pending > 0) return;
      fired = true;
      listener();
    }, 0);
  };

  return {
    begin() {
      pending++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        pending--;
        check();
      };
    },
    arm(onSettled) {
      listener = onSettled;
      check();
    },
    disarm() {
      listener = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
