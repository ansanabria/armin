/** True when the event target is a text-editing surface where bare keys must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute("role") === "textbox") return true;
  // CodeMirror / nested contenteditable hosts.
  return Boolean(target.closest('[contenteditable="true"], .cm-editor'));
}
