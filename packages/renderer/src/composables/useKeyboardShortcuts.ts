import { onMounted, onUnmounted } from 'vue';

export interface KeyboardShortcut {
  key: string;
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  function handleKeydown(event: KeyboardEvent) {
    for (const shortcut of shortcuts) {
      // Check modifier keys
      const ctrlOrCmdMatch = shortcut.ctrlOrCmd
        ? (isMac ? event.metaKey : event.ctrlKey)
        : (!event.metaKey && !event.ctrlKey);

      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

      if (ctrlOrCmdMatch && shiftMatch && altMatch && keyMatch) {
        event.preventDefault();
        shortcut.callback();
        break;
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
