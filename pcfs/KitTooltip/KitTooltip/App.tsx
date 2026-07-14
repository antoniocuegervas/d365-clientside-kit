import * as React from "react";
import { Button, Input, Tooltip } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { kitStrings } from "../../../shared/localization/kitStrings";
import { SmartComponent } from "../../../shared/context/ViewModelContextProvider";
import {
  attributeDescription,
  attributeDisplayName,
  attributeRequired,
  findAttributeMetadata,
} from "../../../shared/metadata/attributeMetadataReads";
import type { Observable } from "../../../shared/reactivity/Observable";

export interface ITooltipAppProps {
  /** Entity logical name of the hosting form's table. */
  entityLogicalName: string;
  /** Bound attribute logical name. */
  attributeLogicalName: string;
  /** Host-owned text value. */
  value: Observable<string | null>;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}

interface ITooltipAppState {
  metadata?: {
    displayName: string;
    required: boolean;
    description?: string;
  };
}

/**
 * Smart tooltip body (pattern 2): a SmartComponent inside a
 * ViewModelContextProvider, it loads the bound attribute's metadata through
 * the kit context and surfaces the authored description on a hover and focus
 * Fluent Tooltip next to a plain text input. The tooltip is positioning only
 * (no focus trap), so it shares no tabster state with the host and cannot hit
 * the shared-instance collision a Popover would. Rendering the description this
 * way also sidesteps the transparent portal a Popover needs the inline prop to
 * avoid.
 */
export class TooltipApp extends SmartComponent<ITooltipAppProps, ITooltipAppState> {
  constructor(props: ITooltipAppProps) {
    super(props);
    this.state = {};
    this.observe(props.value);
  }

  override componentDidMount(): void {
    void this.loadMetadata();
  }

  private async loadMetadata(): Promise<void> {
    try {
      // The standard idiom: entity metadata scoped to the bound attribute,
      // then the attribute picked off the collection.
      const entityMetadata = await this.vmContext.utils.getEntityMetadata(
        this.props.entityLogicalName,
        [this.props.attributeLogicalName]
      );
      const attribute = findAttributeMetadata(entityMetadata, this.props.attributeLogicalName);
      if (!this.isDisposed && attribute) {
        this.setState({
          metadata: {
            displayName: attributeDisplayName(attribute) ?? this.props.attributeLogicalName,
            required: attributeRequired(attribute),
            description: attributeDescription(attribute),
          },
        });
      }
    } catch {
      // No metadata, the control still works as a plain input.
    }
  }

  override render(): React.ReactNode {
    const { metadata } = this.state;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Input
          // filled-darker matches the New Look filled field, like every kit field control.
          appearance="filled-darker"
          style={{ flexGrow: 1 }}
          value={this.props.value.value ?? ""}
          disabled={this.props.disabled}
          onChange={(_event, data) => this.props.onChange(data.value === "" ? null : data.value)}
        />
        {metadata ? (
          <Tooltip
            relationship="description"
            appearance="inverted"
            withArrow
            positioning="above-end"
            content={
              <>
                <strong>{metadata.displayName}</strong>
                {metadata.required ? " (required)" : null}
                <div>{metadata.description ?? kitStrings().noDescriptionAuthored}</div>
              </>
            }
          >
            <Button
              appearance="subtle"
              size="small"
              icon={<InfoRegular />}
              aria-label={`About ${metadata.displayName}`}
            />
          </Tooltip>
        ) : null}
      </div>
    );
  }
}
