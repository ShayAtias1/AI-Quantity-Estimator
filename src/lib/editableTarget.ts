/** The minimum of an event target this module looks at — so it can be reasoned about and tested. */
interface EditableLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/**
 * Whether a keystroke landed inside something the user is typing or editing in. Keyboard shortcuts
 * that destroy work — Delete/Backspace on a selected shape, undo/redo — must stand down there:
 * Backspace in a text field means "erase a character", never "delete the selected measurement".
 */
export function isEditableTarget(target: unknown): boolean {
  const el = target as EditableLike | null;
  if (!el) return false;
  if (el.tagName && EDITABLE_TAGS.includes(el.tagName)) return true;
  if (el.isContentEditable) return true;
  // A caret inside a rich-text editor is usually on a child node of the editable element.
  return typeof el.closest === 'function' ? !!el.closest('[contenteditable="true"]') : false;
}

/** Delete / Backspace on a selected object, outside any editable control. */
export function shouldDeleteSelection(key: string, target: unknown, hasSelection: boolean): boolean {
  if (!hasSelection) return false;
  if (key !== 'Delete' && key !== 'Backspace') return false;
  return !isEditableTarget(target);
}
