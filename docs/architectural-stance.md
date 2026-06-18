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
  // 1. Public Observables, named for CRM concepts
  readonly searchRows = new Observable<IGridRow[]>([]);
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
