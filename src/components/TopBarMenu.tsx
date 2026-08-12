import { useEffect, useRef, type ReactNode } from 'react';

/** Ids of the top-bar dropdowns; both apps' bars pick the ones they use. */
export type MenuId = 'view' | 'export' | 'settings';

/**
 * A top-bar button with a popover menu under it. Only the menu whose id matches `openId` is shown,
 * so the parent's single `openId` state keeps at most one menu open at a time. Closes on an outside
 * click or Escape.
 */
export default function TopBarMenu({
  id,
  openId,
  setOpenId,
  label,
  title,
  highlighted,
  children,
}: {
  id: MenuId;
  openId: MenuId | null;
  setOpenId: (v: MenuId | null) => void;
  label: string;
  title?: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const open = openId === id;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpenId]);

  return (
    <div className="top-bar-menu-anchor" ref={anchorRef}>
      <button
        className={`btn-secondary small top-bar-menu-btn ${open || highlighted ? 'active' : ''}`}
        onClick={() => setOpenId(open ? null : id)}
        title={title}
      >
        {label} <span className="menu-caret">▾</span>
      </button>
      {open && <div className="top-bar-menu">{children}</div>}
    </div>
  );
}
