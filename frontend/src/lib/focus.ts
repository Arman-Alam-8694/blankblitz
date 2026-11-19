/**
 * Keyboard focus arbitration between the game board and chat.
 * PRD: hovering chat moves typing to chat; hovering the board takes it back —
 * unless the chat box has an unfinished message (then an explicit click is required).
 */
let chatInput: HTMLInputElement | null = null;

/** Hover-driven focus only makes sense with a real pointer (never pop the phone keyboard). */
const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function registerChatInput(el: HTMLInputElement | null): void {
  chatInput = el;
}

export function chatHover(): void {
  if (canHover) chatInput?.focus({ preventScroll: true });
}

export function boardHover(): void {
  if (canHover && chatInput && document.activeElement === chatInput && chatInput.value.trim() === '') chatInput.blur();
}

export function boardClick(): void {
  if (chatInput && document.activeElement === chatInput) chatInput.blur();
}

/** True when a key event should be handled by the board (not typed into a field). */
export function boardOwnsKeyboard(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return true;
  const tag = el.tagName;
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable);
}
