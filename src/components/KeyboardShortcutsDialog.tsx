'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS, formatShortcutKey } from '@/lib/keyboard-shortcuts';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions to navigate and control the application
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.action}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm flex-1">{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono border border-border min-w-[60px] text-center">
                {formatShortcutKey(shortcut)}
              </kbd>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-4">
          <p>
            Keyboard shortcuts are disabled when typing in input fields.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
