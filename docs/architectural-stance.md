# Architectural Stance, MVVM for the D365 Delivery Cadence

This kit deliberately uses **View + ViewModel + Observable with class
components**, not hooks-centric React. Read this before "modernizing" anything.

## Why

A typical D365 implementation ships **10–20 custom UI surfaces total**, in
bursts, one webresource this month, a PCF tweak six months later. The people
maintaining them are CRM developers and functional consultants, not full-time
frontend engineers. Hooks fluency is perishable; every return visit pays a
relearning tax before the actual change. A "minor change" should take an hour,
not two days of effect-dependency archaeology.

| MVVM property | Payoff for intermittent maintainers |
|---|---|
| ViewModel holds logic, View declares controls | Open `XyzViewModel.ts`, see all data and rules, same mental model as form scripts |
| Observables = "when this changes, update" | Event-driven, like CRM itself; no rules of capture |
| Class components, explicit lifecycle | PCF roots and CRM handlers are already class-shaped |
| Smart controls absorb metadata wiring | ViewModels stay thin for the 99%-native case |

## Legible to intermittent intelligences, human and model

The point above (that fluency with hooks fades, and you pay to relearn it) is
something the owner saw firsthand, with several strong D365 developers who hit
the same wall after a couple of months on other work. There is a second reason,
also from experience and more forward-looking, that points the same way: what
keeps this code easy to re-read for a developer who comes back twice a year is
the same thing that keeps it easy for a **coding agent to generate from scratch**.

An agent writing a new View and ViewModel starts cold, with none of the prior
context, just like the developer who returns twice a year. Plain class lifecycle
methods, one way of thinking per file, and layer boundaries the linter enforces
are exactly what make a generated app likely to be right the first time and easy
to check against the sample apps. The mistakes an agent is most likely to make,
and that are hardest to catch in review, are the hook-specific ones: the order
hooks have to run in, dependency arrays, and values that go stale inside a
closure. So "write for the reader who shows up with no context" serves two
readers at once: the consultant returning to a webresource, and the model writing
the next one. See `docs/prompt-friendly-development.md` for how the kit is meant
to be generated against.

## The rules

1. **Hosts own state.** ViewModels, smart wrappers, and PCF roots create
   Observables; presentational controls subscribe and re-render
   (`ObserverComponent` handles unsubscribe + disposed-flag safety).
2. **No second state paradigm.** No Redux, no global stores, no hook-first
   composition in kit code. Hooks appear only in tiny `makeStyles` render
   helpers, never for control data.
3. **Large ViewModels are an accepted trade.** Keep the §4.4 shape
   (constructor → public Observables → handlers → dispose). If one grows,
   extract a smart control or shared helper, don't rewrite in hooks.
4. **ViewModels never import Fluent.** UI markup is the View's job.

## ViewModel conventions

```ts
export class CompanySearchViewModel {
  // 1. Public reactive state, named for CRM concepts (an ObservableArray for the
  //    grid rows, a plain Observable for single values)
  readonly searchRows = new ObservableArray<IGridRow>();
  readonly selectedAccountId = new Observable<string | null>(null);

  // 2. Constructor receives IViewModelContext, kicks initial load
  constructor(private readonly context: IViewModelContext) {}

  // 3. Handlers wired explicitly in the View
  readonly onSearch = async (text: string) => { /* fetch → set Observables */ };

  // 4. Disposal, guard async callbacks with tracker.isDisposed
  private readonly tracker = new SubscriptionTracker();
  dispose(): void { this.tracker.dispose(); }
}
```

## To future reviewers from a React background

Yes, `forceUpdate()` via `ObserverComponent` and class components look dated.
That is the point: the primary user returns to one webresource twice a year
and needs to ship by Friday. Optimizing this codebase for React-conference
aesthetics would optimize it away from its users. The stance is recorded here
so well-intentioned refactors don't erode it silently.
