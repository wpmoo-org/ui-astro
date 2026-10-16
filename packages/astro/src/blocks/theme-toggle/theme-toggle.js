const bound = new WeakSet();
const ownerSelector =
  '.moo-ui[data-bs-theme="light"], .moo-ui[data-bs-theme="dark"]';

function synchronize(owner) {
  const theme = owner.dataset.bsTheme;
  for (const button of owner.querySelectorAll("[data-moo-theme-toggle]")) {
    if (button.closest(ownerSelector) !== owner) continue;
    button.setAttribute(
      "aria-label",
      theme === "dark"
        ? button.dataset.mooThemeLabelLight
        : button.dataset.mooThemeLabelDark,
    );
    for (const icon of button.querySelectorAll("[data-moo-theme-icon]")) {
      icon.classList.toggle("d-none", icon.dataset.mooThemeIcon !== theme);
    }
  }
}

export function initThemeToggles(root = document) {
  for (const button of root.querySelectorAll("[data-moo-theme-toggle]")) {
    const owner = button.closest(ownerSelector);
    if (!owner) continue;
    synchronize(owner);
    if (bound.has(button)) continue;
    bound.add(button);
    button.addEventListener("click", () => {
      const owner = button.closest(ownerSelector);
      if (!owner) return;
      const theme = owner.dataset.bsTheme === "dark" ? "light" : "dark";
      owner.dataset.bsTheme = theme;
      synchronize(owner);
      const doc = owner.ownerDocument;
      const documentOwner =
        owner.dataset.mooDocumentOwner === "true" &&
        owner.parentElement === doc.body &&
        owner === doc.body.firstElementChild;
      const key =
        owner.dataset.mooThemeKey?.trim() ||
        (documentOwner ? "moo:theme" : null);
      if (!key) return;
      try {
        doc.defaultView?.localStorage?.setItem(key, theme);
      } catch {
        // Restricted browsing contexts may deny preference storage.
      }
    });
  }
}
