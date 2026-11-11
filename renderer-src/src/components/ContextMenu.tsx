/**
 * 右键菜单：复用统一弹层（nomo 编辑区右键菜单的 Web 版）。
 */
import Popup, { MenuDivider, MenuItem } from "./Popup";

export interface MenuStateItem {
  label: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
  onClick(): void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuStateItem[];
}

export default function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState | null;
  onClose(): void;
}) {
  if (!menu) return null;
  return (
    <Popup anchor={{ x: menu.x, y: menu.y }} onClose={onClose} minWidth={188} autoFocus={false}>
      {menu.items.map((item, index) =>
        item.divider ? (
          <MenuDivider key={"d" + index} />
        ) : (
          <MenuItem
            key={item.label + index}
            label={item.label}
            danger={item.danger}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          />
        ),
      )}
    </Popup>
  );
}