export interface KeyboardShortcut {
  key: string;
  description: string;
  action: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'r', description: 'Refresh incidents', action: 'refresh' },
  { key: 'f', description: 'Focus search bar', action: 'focus-search' },
  { key: ' ', description: 'Toggle auto-play audio', action: 'toggle-audio' },
  { key: 'ArrowUp', description: 'Select previous incident', action: 'select-prev' },
  { key: 'ArrowDown', description: 'Select next incident', action: 'select-next' },
  { key: 'Escape', description: 'Clear selection', action: 'clear-selection' },
  { key: '?', description: 'Show keyboard shortcuts', action: 'show-help', modifiers: { shift: true } },
  { key: 'e', description: 'Open export menu', action: 'open-export' },
  { key: 's', description: 'Open settings', action: 'open-settings' },
];

export function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.getAttribute('contenteditable') === 'true' ||
    element.getAttribute('role') === 'textbox'
  );
}

export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.modifiers?.ctrl) parts.push('Ctrl');
  if (shortcut.modifiers?.shift) parts.push('Shift');
  if (shortcut.modifiers?.alt) parts.push('Alt');
  if (shortcut.modifiers?.meta) parts.push('Cmd');

  const key = shortcut.key === ' ' ? 'Space' : shortcut.key;
  parts.push(key.toUpperCase());

  return parts.join(' + ');
}
