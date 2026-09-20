document.documentElement.classList.add("js");

const FONT_SIZE_STEPS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
const FONT_SIZE_STORAGE_KEY = "interactive-lab-font-size";
const DEFAULT_FONT_SIZE = 100;

const readSavedFontSize = () => {
  try {
    const saved = Number.parseInt(localStorage.getItem(FONT_SIZE_STORAGE_KEY), 10);
    return FONT_SIZE_STEPS.includes(saved) ? saved : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
};

let currentFontSize = readSavedFontSize();
document.documentElement.style.setProperty("--site-font-size", `${currentFontSize}%`);

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%230087ff'/%3E%3Cstop offset='1' stop-color='%2354d6ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ccircle cx='32' cy='32' r='10' fill='white' fill-opacity='.92'/%3E%3C/svg%3E";
document.head.append(favicon);

const header = document.querySelector("[data-header]");
const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");

const createFontSizeControl = () => {
  const navShell = header?.querySelector(".nav-shell");
  if (!navShell || navShell.querySelector(".font-size-control")) return;

  const control = document.createElement("div");
  control.className = "font-size-control";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "글자 크기 조절");
  control.innerHTML = `
    <button type="button" data-font-action="decrease" aria-label="글자 작게">가−</button>
    <button type="button" class="font-size-value" data-font-action="reset" aria-label="글자 크기 기본값으로">100%</button>
    <button type="button" data-font-action="increase" aria-label="글자 크게">가+</button>
    <span class="sr-only" data-font-status aria-live="polite"></span>
  `;

  const updateControl = (announce = false) => {
    document.documentElement.style.setProperty("--site-font-size", `${currentFontSize}%`);
    const valueButton = control.querySelector(".font-size-value");
    valueButton.textContent = `${currentFontSize}%`;
    valueButton.setAttribute("aria-label", `현재 글자 크기 ${currentFontSize}%. 기본값으로 복원`);
    control.querySelector('[data-font-action="decrease"]').disabled = currentFontSize === FONT_SIZE_STEPS[0];
    control.querySelector('[data-font-action="increase"]').disabled = currentFontSize === FONT_SIZE_STEPS.at(-1);
    if (announce) control.querySelector("[data-font-status]").textContent = `글자 크기 ${currentFontSize}%`;
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(currentFontSize)); } catch { /* 저장이 막혀도 현재 페이지에서는 유지 */ }
  };

  control.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-font-action]");
    if (!button) return;
    const currentIndex = FONT_SIZE_STEPS.indexOf(currentFontSize);
    if (button.dataset.fontAction === "decrease" && currentIndex > 0) currentFontSize = FONT_SIZE_STEPS[currentIndex - 1];
    if (button.dataset.fontAction === "increase" && currentIndex < FONT_SIZE_STEPS.length - 1) currentFontSize = FONT_SIZE_STEPS[currentIndex + 1];
    if (button.dataset.fontAction === "reset") currentFontSize = DEFAULT_FONT_SIZE;
    updateControl(true);
  });

  navShell.append(control);
  updateControl();
};

createFontSizeControl();

const closeMenu = () => {
  if (!toggle || !nav) return;
  toggle.setAttribute("aria-expanded", "false");
  toggle.querySelector(".sr-only").textContent = "메뉴 열기";
  nav.classList.remove("is-open");
};

toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  toggle.querySelector(".sr-only").textContent = open ? "메뉴 열기" : "메뉴 닫기";
  nav?.classList.toggle("is-open", !open);
});

nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });

const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 12);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals = document.querySelectorAll(".reveal");
if (reducedMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    });
  }, { threshold: .14, rootMargin: "0px 0px -40px" });
  reveals.forEach((item) => observer.observe(item));
}

