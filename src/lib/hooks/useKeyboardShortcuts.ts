import { useEffect } from 'react';
import { KEYBOARD_SHORTCUTS, isInputElement } from '@/lib/keyboard-shortcuts';

export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInputElement(event.target as Element)) {
        return;
      }

      const shortcut = KEYBOARD_SHORTCUTS.find((s) => {
        const keyMatches = s.key.toLowerCase() === event.key.toLowerCase();

        const ctrlMatches = !s.modifiers?.ctrl || event.ctrlKey;
        const shiftMatches = !s.modifiers?.shift || event.shiftKey;
        const altMatches = !s.modifiers?.alt || event.altKey;
        const metaMatches = !s.modifiers?.meta || event.metaKey;

        const noExtraModifiers =
          (s.modifiers?.ctrl || !event.ctrlKey) &&
          (s.modifiers?.shift || !event.shiftKey) &&
          (s.modifiers?.alt || !event.altKey) &&
          (s.modifiers?.meta || !event.metaKey);

        return (
          keyMatches &&
          ctrlMatches &&
          shiftMatches &&
          altMatches &&
          metaMatches &&
          noExtraModifiers
        );
      });

      if (shortcut && handlers[shortcut.action]) {
        event.preventDefault();
        handlers[shortcut.action]();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
