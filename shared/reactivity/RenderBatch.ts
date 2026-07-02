import { unstable_batchedUpdates } from "react-dom";

/**
 * Merges view re-renders so one burst of Observable writes paints once.
 *
 * Why this exists: the webresource shell runs on React 18, which merges
 * pending updates on its own wherever they come from. The PCF host provides
 * React 16 or 17, which only merges updates raised inside DOM event handlers.
 * On that host, a ViewModel that finishes a data load and writes three
 * Observables in a row would repaint the view three times. This queue
 * collects the components asking to re-render and repaints them together,
 * right after the current run of code finishes, so both hosts paint once.
 *
 * Only the REPAINT is delayed. Observable values and subscriber callbacks
 * stay synchronous: a ViewModel that writes a value and reads it back, or
 * chains logic off a subscription, sees the change immediately.
 */

type RenderCallback = () => void;

const pending = new Set<RenderCallback>();
let flushScheduled = false;

/**
 * True while the browser is delivering a DOM event (a click, a keystroke).
 * `window.event` is set by the browser for exactly that window of time.
 */
function insideDomEvent(): boolean {
  return typeof window !== "undefined" && window.event !== undefined;
}

function flush(): void {
  flushScheduled = false;
  // Copy first: a render can schedule further renders, and those belong to
  // the NEXT pass, not this one.
  const batch = [...pending];
  pending.clear();
  // On React 16/17 this merges the whole pass into one repaint. On React 18
  // it just calls through, because that React merges on its own.
  unstable_batchedUpdates(() => {
    for (const render of batch) {
      // Isolate each render, the same discipline Observable.setValue applies
      // to its subscribers: the components were already removed from the
      // queue, so one throwing render must not starve the rest of a repaint
      // they are owed (their views would silently show stale state).
      try {
        render();
      } catch (error) {
        console.error("RenderBatch: a queued render threw", error);
      }
    }
  });
}

/**
 * Asks for `render` to run soon. Pass the SAME function instance each time
 * (a stable bound method): repeated requests for it collapse into one call.
 *
 * Inside a DOM event handler the render runs immediately instead: React
 * merges updates there on every version it might run on, and delaying past
 * the handler would fight how React manages typed-in text (it puts a
 * controlled input's shown text back to the last rendered value when the
 * handler ends, so a late render makes the caret jump).
 */
export function scheduleRender(render: RenderCallback): void {
  if (insideDomEvent()) {
    render();
    return;
  }
  pending.add(render);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}
