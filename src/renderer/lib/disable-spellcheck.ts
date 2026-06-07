const NO_SPELLCHECK_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""]';

function applyNoSpellcheck(element: Element) {
  if (!(element instanceof HTMLElement)) return;

  element.setAttribute("spellcheck", "false");
  element.setAttribute("autocorrect", "off");
  element.setAttribute("autocapitalize", "off");
  element.setAttribute("data-gramm", "false");
  element.setAttribute("data-gramm_editor", "false");
  element.setAttribute("data-enable-grammarly", "false");

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    element.spellcheck = false;
  }
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(NO_SPELLCHECK_SELECTOR)) {
    applyNoSpellcheck(root);
  }
  root.querySelectorAll(NO_SPELLCHECK_SELECTOR).forEach(applyNoSpellcheck);
}

/** Disable spellcheck on all current and future text fields in the renderer. */
export function installNoSpellcheck() {
  const root = document.documentElement;
  root.setAttribute("spellcheck", "false");
  root.setAttribute("autocorrect", "off");
  root.setAttribute("autocapitalize", "off");

  const boot = () => {
    document.body?.setAttribute("spellcheck", "false");
    scan(document);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
