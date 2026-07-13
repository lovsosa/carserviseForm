import { SETTINGS } from "./refs.js";

export function setHint(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!SETTINGS.HINTS_ENABLED) {
    el.textContent = "";
    el.classList.add("is-hidden");
    return;
  }
  el.classList.remove("is-hidden");
  el.textContent = text ?? "";
}

export function setSelectOptions(selectEl, items, { placeholder = "Выберите", valueKey = "value", labelKey = "label" } = {}) {
  selectEl.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = String(it[valueKey]);
    opt.textContent = String(it[labelKey]);
    selectEl.appendChild(opt);
  }
}

export function extractLinkedElementId(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length ? String(value[0]).trim() : null;
  if (typeof value === "object") {
    const vals = Object.values(value);
    return vals.length ? String(vals[0]).trim() : null;
  }
  const s = String(value).trim();
  return s || null;
}

export function showPagePreloader() {
  const el = document.getElementById("page-preloader");
  if (el) el.classList.add("is-active");
}

export function hidePagePreloader() {
  const el = document.getElementById("page-preloader");
  if (el) el.classList.remove("is-active");
}

export function showSubmitOverlay({ status = "Создание СЗ...", linkHref = "", linkLabel = "Протокол" } = {}) {
  const overlay = document.getElementById("submit-overlay");
  const statusEl = document.getElementById("submitStatus");
  const linkEl = document.getElementById("submitLink");
  if (!overlay) return;

  if (statusEl) statusEl.textContent = status;

  if (linkEl) {
    linkEl.innerHTML = "";
    if (linkHref) {
      const a = document.createElement("a");
      a.href = linkHref;
      a.target = "_parent";
      a.textContent = linkLabel;
      linkEl.appendChild(a);
    }
  }

  overlay.classList.add("is-active");

  const closeBtn = document.getElementById("submitClose");
  if (closeBtn) closeBtn.onclick = hideSubmitOverlay;
}

export function hideSubmitOverlay() {
  const overlay = document.getElementById("submit-overlay");
  if (overlay) overlay.classList.remove("is-active");
}
