document.documentElement.classList.add("js");

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%230087ff'/%3E%3Cstop offset='1' stop-color='%2354d6ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)'/%3E%3Ccircle cx='32' cy='32' r='10' fill='white' fill-opacity='.92'/%3E%3C/svg%3E";
document.head.append(favicon);

const header = document.querySelector("[data-header]");
const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");

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

