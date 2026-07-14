import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type { IAttributeMetadata, IFormattingInfo } from "../../context/IViewModelContext";
import {
  attributeCanBeSecuredForUpdate,
  attributeDisplayName,
  attributeIsSecured,
  attributeRequired,
  findAttributeMetadata,
} from "../../metadata/attributeMetadataReads";
import { isObservable, type Observable, type OrObservable } from "../../reactivity/Observable";
import { WaitingMessage } from "../presentational/WaitingMessage";
import { FieldShell } from "../presentational/FieldShell";

/**
 * Declarative config shared by every metadata-aware field control.
 *
 * The form-designer mental model: drop the block with `entity` + `attribute`
 * + a value Observable; label, options, precision, formats, and targets
 * resolve from Dataverse metadata. Every metadata-derived default can be
 * overridden by a prop, exactly like overriding a label on a form.
 */
export interface ISmartFieldProps<TValue> {
  /** Entity logical name, e.g. "account". */
  entity: string;
  /** Attribute logical name, e.g. "industrycode". */
  attribute: string;
  /**
   * Host-owned value. The smart control writes the user's change into
   * this observable AND raises onChange, ViewModels can bind either way.
   */
  value: Observable<TValue>;
  onChange?: (value: TValue) => void;
  /** Override the metadata display name. */
  label?: string;
  /** Override the metadata requirement level indicator. */
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  errorMessage?: OrObservable<string | undefined>;
  /**
   * Always-visible helper text under the label (Fluent Field hint). OPT-IN:
   * renders only when passed; there is no metadata default (the attribute's
   * Dataverse Description deliberately does not leak in, see the tooltip
   * direction in the roadmap). A free-form `placeholder` is still not
   * offered: what a smart field shows comes from metadata or an explicit
   * authoring decision like this one.
   */
  hint?: string;
  /** Label placement: "top" (default) or "start" (beside the field, RTL-aware). */
  labelPosition?: "top" | "start";
}

interface ISmartFieldState {
  metadata?: IAttributeMetadata;
  /** User locale formatting, loaded only when the control opts in. */
  formatting?: IFormattingInfo;
  loadError?: string;
  /** The observables last rendered, tracked to detect a rebind before render. */
  boundValue?: unknown;
  boundError?: unknown;
  /** Bumped per rebind; part of the child key so a rebind remounts the child. */
  rebindEpoch?: number;
}

/**
 * Base for smart field controls: loads attribute metadata once via the host
 * context, shows the kit's standard loading presentation meanwhile,
 * then delegates to a presentational child with resolved props.
 */
export abstract class SmartFieldBase<
  TValue,
  TProps extends ISmartFieldProps<TValue> = ISmartFieldProps<TValue>,
> extends SmartComponent<TProps, ISmartFieldState> {
  /**
   * Bumped on every metadata load. A load only writes its result when it is
   * still the latest, so a slow earlier load cannot overwrite a newer rebind.
   */
  private metadataSequence = 0;

  constructor(props: TProps) {
    super(props);
    this.state = {};
    this.observe(props.value, props.errorMessage);
  }

  /**
   * Runs before every render: when the bound observables change identity (a
   * rebind on a reused instance), bump the child key epoch IN the same render.
   * Presentational controls subscribe to their Observable props once, in
   * their constructor (the documented identity-stable contract), so a rebind
   * must hand them a fresh instance; reusing one would leave it subscribed to
   * the previous binding's observables and rendering the new ones. A PLAIN
   * errorMessage string is exempt: it re-renders like any prop, and keying on
   * it would remount (and blur) the field per message change.
   */
  static getDerivedStateFromProps(
    // Typed loosely (React's static typing has no access to the class
    // generics, and narrower parameter types break ComponentType inference
    // in tooling like Storybook); the cast below restores the real shape.
    rawProps: unknown,
    state: ISmartFieldState
  ): Partial<ISmartFieldState> | null {
    const props = rawProps as ISmartFieldProps<unknown>;
    const error = isObservable(props.errorMessage as OrObservable<string | undefined>)
      ? props.errorMessage
      : undefined;
    if (state.boundValue !== props.value || state.boundError !== error) {
      return {
        boundValue: props.value,
        boundError: error,
        rebindEpoch: (state.rebindEpoch ?? 0) + 1,
      };
    }
    return null;
  }

  override componentDidMount(): void {
    void this.loadMetadata();
  }

  /**
   * Resilience for reuse: React keeps one control instance when the same
   * control type stays at the same tree position (e.g. a field that swaps
   * entity/attribute across wizard steps, or rebinds its value Observable).
   * Metadata loads and the value subscription are established on mount, so on
   * such a change we reload metadata and re-subscribe here rather than silently
   * showing the previous attribute's label and ignoring edits.
   */
  override componentDidUpdate(prevProps: TProps): void {
    if (prevProps.entity !== this.props.entity || prevProps.attribute !== this.props.attribute) {
      this.setState({ metadata: undefined, loadError: undefined });
      void this.loadMetadata();
    }
    if (prevProps.value !== this.props.value || prevProps.errorMessage !== this.props.errorMessage) {
      this.reobserve(this.props.value, this.props.errorMessage);
    }
  }

  /**
   * Override to true on controls that localize via user settings
   * date and numeric fields. Defaults to false so other fields skip the
   * extra context call.
   */
  protected usesFormatting(): boolean {
    return false;
  }

  /**
   * Subclass hook: resolve everything ELSE the first render needs (the
   * record currency, the org pricing precision, switcher labels, icons) and
   * return a synchronous apply step. The base awaits it after the metadata
   * arrives and runs the apply right before the single state commit, so a
   * control's form-load render count stays in the platform's own band (one
   * loading paint, one content paint) instead of one repaint per resolved
   * piece. Failures must be handled inside: an extra is presentation sugar
   * and must never take the field down. The base's stale-load guard covers
   * the whole ride, so a rebind discards the previous binding's extras
   * together with its metadata.
   */
  protected async loadExtras(_metadata: IAttributeMetadata): Promise<(() => void) | undefined> {
    return undefined;
  }

  private async loadMetadata(): Promise<void> {
    const { entity, attribute } = this.props;
    const sequence = ++this.metadataSequence;
    try {
      // Resolve EVERYTHING the first paint needs, then commit once. The
      // standard pattern for the metadata itself: ask the host for the entity's
      // metadata scoped to this one attribute, then pick the attribute off
      // the collection. Formatting resolves in parallel (it does not depend
      // on the metadata and is non-fatal); subclass extras resolve after,
      // because they read the metadata.
      const [entityMetadata, formatting] = await Promise.all([
        this.vmContext.utils.getEntityMetadata(entity, [attribute]),
        this.usesFormatting()
          ? this.vmContext.getFormatting().catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      const metadata = findAttributeMetadata(entityMetadata, attribute);
      if (!metadata) {
        throw new Error(`Entity metadata for '${entity}' carries no attribute '${attribute}'`);
      }
      const applyExtras = await this.loadExtras(metadata);
      // Stale-response guard: only the latest load may write, so a slow earlier
      // load (a previous attribute) cannot overwrite a newer rebind.
      if (!this.isDisposed && sequence === this.metadataSequence) {
        // The apply step and the state commit share one synchronous block:
        // observable writes land before the presentational child mounts (it
        // subscribes in its constructor), so the child's first render already
        // sees them and nothing repaints twice.
        applyExtras?.();
        this.setState({ metadata, formatting });
      }
    } catch (error) {
      if (!this.isDisposed && sequence === this.metadataSequence) {
        // Never surface raw SDK text to the user; log it for developers and show a neutral message under the field label.
        // Seeing this logged during a unit test run is expected and not a failure: a SmartFieldBase
        // test fails a metadata load on purpose to exercise this fallback, and the test passes.
        console.error(`Smart field metadata load failed for ${entity}.${attribute}`, error);
        this.setState({ loadError: kitStrings().fieldUnavailable });
      }
    }
  }

  /** Effective label: prop override, else metadata display name. */
  protected resolveLabel(metadata: IAttributeMetadata): string {
    return this.props.label ?? attributeDisplayName(metadata) ?? this.props.attribute;
  }

  /** Effective required flag: prop override, else metadata requirement. */
  protected resolveRequired(metadata: IAttributeMetadata): boolean {
    return this.props.required ?? attributeRequired(metadata);
  }

  /**
   * Effective hint: the prop, or nothing. Always-visible helper text is
   * OPT-IN: the earlier default (falling back to the attribute's Dataverse
   * Description) made every described field grow permanent text under its
   * label whether the author wanted it or not, which is not what a
   * description usually means (the common approach is an on-demand
   * tooltip). The Description stays readable via attributeDescription for
   * surfaces that opt in, the way the tooltip control does.
   */
  protected resolveHint(_metadata: IAttributeMetadata): string | undefined {
    return this.props.hint;
  }

  /**
   * Effective read-only: an explicit `readOnly` prop wins; otherwise a
   * column-secured field defaults to read-only, but only when the column's
   * UPDATE can actually be restricted (CanBeSecuredForUpdate). A column
   * secured for read only can never have its update denied by a profile, so
   * locking it would be pure friction. The kit cannot resolve this user's
   * effective column access off a form, so within that boundary it fails
   * safe rather than render an editable control whose save the platform
   * would reject. A host that knows the user can edit the secured column
   * passes `readOnly={false}`.
   */
  protected resolveReadOnly(metadata: IAttributeMetadata): boolean {
    return (
      this.props.readOnly ??
      (attributeIsSecured(metadata) && attributeCanBeSecuredForUpdate(metadata) !== false)
    );
  }

  /** Standard change plumbing: write host-owned observable, raise event. */
  protected readonly commitChange = (value: TValue): void => {
    this.props.value.value = value;
    this.props.onChange?.(value);
  };

  /** Renders the presentational child once metadata is available. */
  protected abstract renderField(metadata: IAttributeMetadata): React.ReactNode;

  override render(): React.ReactNode {
    const { metadata, loadError } = this.state;
    if (loadError) {
      return (
        <FieldShell label={this.props.label ?? this.props.attribute} errorMessage={loadError}>
          <span />
        </FieldShell>
      );
    }
    if (!metadata) {
      return <WaitingMessage inline message={this.props.label ?? kitStrings().loading} />;
    }
    // Keyed by the binding: a rebind (new attribute or new observables)
    // remounts the presentational child so its constructor-time subscriptions
    // follow the new binding (see getDerivedStateFromProps).
    return (
      <React.Fragment
        key={`${this.props.entity}|${this.props.attribute}|${this.state.rebindEpoch ?? 0}`}
      >
        {this.renderField(metadata)}
      </React.Fragment>
    );
  }
}
