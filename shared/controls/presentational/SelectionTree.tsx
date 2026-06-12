import * as React from "react";
import { Button, Checkbox, makeStyles, tokens } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";

/**
 * Hierarchical multi-select tree, supplied nodes, host-owned checked
 * set. The host (ViewModel or smart wrapper) loads nodes from wherever it
 * wants; the tree only renders and raises change events.
 */

export interface ITreeNode {
  id: string;
  label: string;
  children?: ITreeNode[];
}

export interface ISelectionTreeProps {
  nodes: OrObservable<ITreeNode[]>;
  /** Host-owned set of checked node ids. */
  checkedIds: Observable<string[]>;
  onCheckedChange?: (checkedIds: string[]) => void;
  disabled?: boolean;
  /** Checking a parent also checks its descendants. Default true. */
  cascadeChildren?: boolean;
}

interface ISelectionTreeState {
  collapsedIds: Set<string>;
}

const useStyles = makeStyles({
  nodeRow: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXXS },
  childIndent: { marginLeft: tokens.spacingHorizontalXXL },
  chevronSpacer: { width: "32px", flexShrink: 0 },
});

export class SelectionTree extends ObserverComponent<ISelectionTreeProps, ISelectionTreeState> {
  constructor(props: ISelectionTreeProps) {
    super(props);
    this.state = { collapsedIds: new Set() };
    this.observe(props.nodes, props.checkedIds);
  }

  private readonly toggleCollapse = (id: string): void => {
    this.setState((previous) => {
      const collapsedIds = new Set(previous.collapsedIds);
      if (collapsedIds.has(id)) {
        collapsedIds.delete(id);
      } else {
        collapsedIds.add(id);
      }
      return { collapsedIds };
    });
  };

  private readonly toggleChecked = (node: ITreeNode): void => {
    const checked = new Set(this.props.checkedIds.value);
    const ids =
      this.props.cascadeChildren === false ? [node.id] : [node.id, ...descendantIds(node)];
    const turningOn = !checked.has(node.id);
    for (const id of ids) {
      if (turningOn) {
        checked.add(id);
      } else {
        checked.delete(id);
      }
    }
    this.props.onCheckedChange?.([...checked]);
  };

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        state={this.state}
        onToggleCollapse={this.toggleCollapse}
        onToggleChecked={this.toggleChecked}
      />
    );
  }
}

const Body: React.FC<
  ISelectionTreeProps & {
    state: ISelectionTreeState;
    onToggleCollapse: (id: string) => void;
    onToggleChecked: (node: ITreeNode) => void;
  }
> = (props) => {
  const styles = useStyles();
  const nodes = valueOf(props.nodes);
  const checked = new Set(props.checkedIds.value);

  const renderNode = (node: ITreeNode): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const collapsed = props.state.collapsedIds.has(node.id);
    return (
      <div key={node.id} role="treeitem" aria-expanded={hasChildren ? !collapsed : undefined}>
        <div className={styles.nodeRow}>
          {hasChildren ? (
            <Button
              appearance="transparent"
              size="small"
              icon={collapsed ? <ChevronRightRegular /> : <ChevronDownRegular />}
              aria-label={collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
              onClick={() => props.onToggleCollapse(node.id)}
            />
          ) : (
            <span className={styles.chevronSpacer} />
          )}
          <Checkbox
            checked={checked.has(node.id)}
            disabled={props.disabled}
            label={node.label}
            onChange={() => props.onToggleChecked(node)}
          />
        </div>
        {hasChildren && !collapsed ? (
          <div className={styles.childIndent} role="group">
            {node.children!.map(renderNode)}
          </div>
        ) : null}
      </div>
    );
  };

  return <div role="tree">{nodes.map(renderNode)}</div>;
};

function descendantIds(node: ITreeNode): string[] {
  return (node.children ?? []).flatMap((child) => [child.id, ...descendantIds(child)]);
}
