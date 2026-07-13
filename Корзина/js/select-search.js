import { setSelectOptions } from "./utils.js";

export function enhanceSelectWithSearch(select) {
  if (!select || select.dataset.searchable === "1") return;
  select.dataset.searchable = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "select-search";

  const parent = select.parentNode;
  if (!parent) return;
  parent.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "control select-search__input";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "select-search__toggle";
  toggle.setAttribute("aria-label", "Показать варианты");
  toggle.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.4 9.6a1 1 0 0 1 1.2-.2l4.4 2.4 4.4-2.4a1 1 0 1 1 1 1.74l-4.9 2.7a1 1 0 0 1-.98 0l-4.9-2.7a1 1 0 0 1-.3-1.54Z"/></svg>';

  const list = document.createElement("div");
  list.className = "select-search__list";

  wrapper.appendChild(searchInput);
  wrapper.appendChild(toggle);
  wrapper.appendChild(list);

  select.classList.add("select-hidden");

  const searchId = select.id ? `${select.id}__search` : "";
  if (searchId) {
    searchInput.id = searchId;
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) label.setAttribute("for", searchId);
  }

  const placeholderText = () => {
    const opt0 = select.querySelector("option[value='']");
    return opt0 ? opt0.textContent.trim() : "Выберите значение";
  };

  const closeList = () => wrapper.classList.remove("is-open");
  const openList = (forceAll = false) => {
    wrapper.classList.add("is-open");
    renderList(forceAll ? "" : searchInput.value);
  };

  const syncFromSelect = () => {
    const selected = select.options[select.selectedIndex];
    searchInput.value = selected && selected.value ? selected.textContent : "";
    searchInput.placeholder = placeholderText();
    searchInput.disabled = select.disabled;
    wrapper.classList.toggle("is-disabled", select.disabled);
  };

  const chooseOption = (value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncFromSelect();
    closeList();
    searchInput.blur();
  };

  const renderList = (filter = "") => {
    list.innerHTML = "";
    const term = filter.trim().toLowerCase();
    const options = Array.from(select.options).filter((o) => o.value !== "");
    const filtered = term ? options.filter((o) => o.textContent.toLowerCase().includes(term)) : options;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "select-search__empty";
      empty.textContent = "Не найдено";
      list.appendChild(empty);
      return;
    }

    filtered.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "select-search__item";
      if (select.value === opt.value) item.classList.add("is-selected");
      item.textContent = opt.textContent;
      item.dataset.value = opt.value;
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        chooseOption(opt.value);
      });
      item.addEventListener("click", (e) => {
        e.preventDefault();
        chooseOption(opt.value);
      });
      list.appendChild(item);
    });
  };

  searchInput.addEventListener("focus", () => {
    searchInput.select();
    openList(true);
  });
  searchInput.addEventListener("input", () => openList());
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeList();
      searchInput.blur();
    }
  });

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    if (wrapper.classList.contains("is-open")) closeList();
    else openList();
    searchInput.focus();
  });

  select.addEventListener("change", syncFromSelect);

  const observer = new MutationObserver(() => {
    syncFromSelect();
    if (wrapper.classList.contains("is-open")) renderList(searchInput.value);
  });
  observer.observe(select, { childList: true, subtree: true });

  document.addEventListener("click", (evt) => {
    if (!wrapper.contains(evt.target)) closeList();
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      closeList();
      syncFromSelect();
    }, 120);
  });

  syncFromSelect();
}

export function setupSelectSearch() {
  document.querySelectorAll("select.control").forEach(enhanceSelectWithSearch);
}
