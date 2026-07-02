/**
 * Development-only check for the observe() contract: every Observable whose
 * `.value` a render reads must be in that component's observe() list, or the
 * screen silently stops updating when the value changes. The mistake itself
 * used to be silent too; this makes it a console warning at the moment the
 * unobserved read happens.
 *
 * How it works: ObserverComponent brackets each render() call with
 * begin/endObserverRender, and Observable's value getter reports reads here.
 * A read during a render that is not in the rendering component's observed
 * set warns once per component instance + observable pair. Reads outside a
 * render (ViewModels, event handlers, async continuations) never warn, and
 * function components rendered by an observer run outside its render() call,
 * so the parent-observes-child-reads pattern does not trip it.
 *
 * Everything here is called behind `process.env.NODE_ENV !== "production"`
 * guards, so shipped builds strip the calls and pay nothing.
 */

/** What the checker needs to know about the component currently rendering. */
export interface IObserverRenderFrame {
  /** Component display name for the warning text. */
  name: string;
  /** The sources this component passed to observe()/reobserve(). */
  observed: ReadonlySet<unknown>;
  /** Pairs already warned about, so each one warns once, not per render. */
  warned: Set<unknown>;
}

let currentFrame: IObserverRenderFrame | null = null;

/** Marks a frame as rendering; returns the previous frame to restore. */
export function beginObserverRender(frame: IObserverRenderFrame): IObserverRenderFrame | null {
  const previous = currentFrame;
  currentFrame = frame;
  return previous;
}

/** Restores the previous frame when a render finishes (stack discipline). */
export function endObserverRender(previous: IObserverRenderFrame | null): void {
  currentFrame = previous;
}

/** Called by Observable's value getter; warns on an unobserved read mid-render. */
export function noteObservableRead(observable: unknown): void {
  const frame = currentFrame;
  if (!frame || frame.observed.has(observable) || frame.warned.has(observable)) {
    return;
  }
  frame.warned.add(observable);
  console.warn(
    `${frame.name} read an Observable's value during render without observing it. ` +
      "The screen will not update when that value changes. Pass the Observable to " +
      "this.observe(...) (or include it in reobserve() if the component rebinds)."
  );
}
