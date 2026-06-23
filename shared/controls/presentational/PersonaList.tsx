import * as React from "react";
import { Avatar, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type OrObservable } from "../../reactivity/Observable";

/**
 * Persona list, custom contact/user layouts the native form can't
 * host. Items are supplied; click handling is the host's. An item can carry up
 * to five secondary lines (e.g. a grid row collapsed to a card on a narrow
 * host); the avatar grows with the number of lines.
 */

export interface IPersonaItem {
  id: string;
  name: string;
  /** A single secondary line (kept for the simple case). */
  secondaryText?: string;
  /** Extra secondary lines, shown after {@link secondaryText}. Capped at five total. */
  secondaryTexts?: string[];
  imageUrl?: string;
}

export interface IPersonaListProps {
  items: OrObservable<IPersonaItem[]>;
  onItemClick?: (item: IPersonaItem) => void;
  emptyMessage?: string;
}

/** Avatar size by secondary-line count (1 line .. 5 lines), so taller cards get a bigger avatar. */
const AVATAR_SIZES = [32, 40, 48, 56, 64] as const;

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
      {items.map((item) => {
        const secondary = [item.secondaryText, ...(item.secondaryTexts ?? [])]
          .filter((line): line is string => !!line)
          .slice(0, 5);
        const size = AVATAR_SIZES[Math.max(secondary.length, 1) - 1] ?? AVATAR_SIZES[0];
        return (
          <div
            key={item.id}
            role="listitem"
            className={`${styles.item} ${props.onItemClick ? styles.clickable : ""}`}
            onClick={props.onItemClick ? () => props.onItemClick!(item) : undefined}
          >
            <Avatar name={item.name} size={size} image={item.imageUrl ? { src: item.imageUrl } : undefined} />
            <div>
              <div className={styles.name}>{item.name}</div>
              {secondary.map((line, index) => (
                <div key={index} className={styles.secondary}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
