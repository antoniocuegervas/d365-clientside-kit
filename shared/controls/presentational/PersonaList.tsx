import * as React from "react";
import { Avatar, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";

/**
 * Persona list, custom contact/user layouts the native form can't
 * host. Items are supplied; click handling is the host's.
 */

export interface IPersonaItem {
  id: string;
  name: string;
  secondaryText?: string;
  imageUrl?: string;
}

export interface IPersonaListProps {
  items: OrObservable<IPersonaItem[]>;
  onItemClick?: (item: IPersonaItem) => void;
  emptyMessage?: string;
}

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column" },
  item: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  clickable: { cursor: "pointer" },
  name: { fontWeight: tokens.fontWeightSemibold },
  secondary: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  empty: { color: tokens.colorNeutralForeground3, padding: tokens.spacingVerticalM },
});

export class PersonaList extends ObserverComponent<IPersonaListProps> {
  constructor(props: IPersonaListProps) {
    super(props);
    this.observe(props.items);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IPersonaListProps> = (props) => {
  const styles = useStyles();
  const items = valueOf(props.items);

  if (items.length === 0) {
    return <div className={styles.empty}>{props.emptyMessage ?? "No people to show"}</div>;
  }

  return (
    <div className={styles.list} role="list">
      {items.map((item) => (
        <div
          key={item.id}
          role="listitem"
          className={`${styles.item} ${props.onItemClick ? styles.clickable : ""}`}
          onClick={props.onItemClick ? () => props.onItemClick!(item) : undefined}
        >
          <Avatar name={item.name} image={item.imageUrl ? { src: item.imageUrl } : undefined} />
          <div>
            <div className={styles.name}>{item.name}</div>
            {item.secondaryText ? <div className={styles.secondary}>{item.secondaryText}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
};
