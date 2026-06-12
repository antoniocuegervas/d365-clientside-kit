import * as React from "react";
import {
  Button,
  Input,
  Popover,
  PopoverSurface,
  PopoverTrigger,
} from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { SmartComponent } from "../../../shared/context/ViewModelContextProvider";
import type { IAttributeMetadata } from "../../../shared/context/IViewModelContext";
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
  metadata?: IAttributeMetadata;
}

/**
 * Smart tooltip body (pattern 2): a SmartComponent inside a
 * ViewModelContextProvider, it loads the bound attribute's metadata through
 * the kit context and surfaces the authored description as a rich tooltip
 * next to a plain text input.
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
      const metadata = await this.vmContext.metadata.getAttributeMetadata(
        this.props.entityLogicalName,
        this.props.attributeLogicalName
      );
      if (!this.isDisposed) {
        this.setState({ metadata });
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
          style={{ flexGrow: 1 }}
          value={this.props.value.value ?? ""}
          disabled={this.props.disabled}
          onChange={(_event, data) => this.props.onChange(data.value === "" ? null : data.value)}
        />
        {metadata ? (
          <Popover withArrow positioning="above-end">
            <PopoverTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                size="small"
                icon={<InfoRegular />}
                aria-label={`About ${metadata.displayName}`}
              />
            </PopoverTrigger>
            <PopoverSurface style={{ maxWidth: 280 }}>
              <strong>{metadata.displayName}</strong>
              {metadata.required ? " (required)" : null}
              <div>{metadata.description ?? "No description has been authored for this column."}</div>
            </PopoverSurface>
          </Popover>
        ) : null}
      </div>
    );
  }
}
