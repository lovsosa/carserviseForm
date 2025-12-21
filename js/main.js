const API_URL = "https://carservice.bitrix24.kz/rest/25585/law35drn41ly2wm1/";
const $ = (sel) => document.querySelector(sel);

const DEBUG_DUMP_VALUES = true;

const debugEl = $("#debug");
const logDebug = (obj) => {
  if (!debugEl) return;
  debugEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
};

const REF = {
  DC: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 141, TITLE_FIELD: "NAME" },
  PDC: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 139, TITLE_FIELD: "NAME", PARENT_FIELD: "PROPERTY_651" },

  EXPENSE_ARTICLE: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 133, TITLE_FIELD: "NAME" },
  EXPENSE_SUBARTICLE: { IBLOCK_TYPE_ID: "bitrix_processes", IBLOCK_ID: 135, TITLE_FIELD: "NAME", PARENT_FIELD: "PROPERTY_647" },
};

function cacheKey(prefix, ref, ver = "v1") {
  return `${prefix}_${ref.IBLOCK_TYPE_ID}_${ref.IBLOCK_ID}_${ver}`;
}

function setHint(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

function setSelectOptions(
  selectEl,
  items,
  { placeholder = "Р’С‹Р±РµСЂРёС‚Рµ", valueKey = "value", labelKey = "label" } = {}
) {
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

// ========= CACHE HELPERS =========
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 С‡Р°СЃРѕРІ

function readCache(key, ver, ttlMs = CACHE_TTL_MS) {
  const raw = sessionStorage.getItem(key);
  if (!raw) return { state: "miss" };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { state: "legacy", data: parsed };
    if (parsed.ver !== ver) return { state: "ver_mismatch" };
    const age = Date.now() - (parsed.fetchedAt || 0);
    const fresh = age <= ttlMs;
    return { state: fresh ? "fresh" : "stale", data: parsed.data };
  } catch (_) {
    sessionStorage.removeItem(key);
    return { state: "error" };
  }
}

function writeCache(key, ver, data) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ver,
        fetchedAt: Date.now(),
        data,
      })
    );
  } catch (_) {}
}

async function loadWithCache({ key, version, fetcher, onData }) {
  const cache = readCache(key, version);
  if (cache.data) {
    onData(cache.data, cache.state);
    if (cache.state === "fresh") return cache;
  }

  try {
    const freshData = await fetcher();
    onData(freshData, "fresh");
    writeCache(key, version, freshData);
    return { state: "fresh", data: freshData };
  } catch (e) {
    if (!cache.data) throw e;
    return { state: cache.state, data: cache.data, error: e };
  }
}

function dumpValues(label, items) {
  if (!DEBUG_DUMP_VALUES) return;

  try {
    console.groupCollapsed(`рџ”Ћ ${label} (count=${items?.length ?? 0})`);
    console.log(items);
    if (Array.isArray(items) && items.length && typeof items[0] === "object") {
      console.table(items);
    }
    console.groupEnd();
  } catch (e) {
    console.warn("dumpValues error:", e);
  }
}

function logStage(label, msg, extra) {
  if (extra !== undefined) console.log(`[${label}] ${msg}`, extra);
  else console.log(`[${label}] ${msg}`);
}

// ========= Bitrix environment / mock =========
const isInBitrix = typeof window.BX24 !== "undefined";

if (!isInBitrix) {
  window.BX24 = {
    init: (cb) => cb(),
    callMethod: (method, params, cb) => {
      if (method === "user.get") {
        cb({
          error: () => null,
          data: () => [
            { ID: 1, NAME: "РўРµСЃС‚", LAST_NAME: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ" },
            { ID: 2, NAME: "РРІР°РЅ", LAST_NAME: "РРІР°РЅРѕРІ" },
          ],
          more: () => false,
          next: () => { },
        });
        return;
      }

      if (method === "crm.currency.list") {
        cb({
          error: () => null,
          data: () => [
            { CURRENCY: "KGS", FULL_NAME: "РљС‹СЂРіС‹Р·СЃРєРёР№ СЃРѕРј" },
            { CURRENCY: "USD", FULL_NAME: "Р”РѕР»Р»Р°СЂ РЎРЁРђ" },
            { CURRENCY: "EUR", FULL_NAME: "Р•РІСЂРѕ" },
            { CURRENCY: "RUB", FULL_NAME: "Р РѕСЃСЃРёР№СЃРєРёР№ СЂСѓР±Р»СЊ" },
          ],
          more: () => false,
          next: () => { },
        });
        return;
      }

      if (method === "profile") {
        cb({
          error: () => null,
          data: () => ({ ID: 1 }),
          more: () => false,
          next: () => { },
        });
        return;
      }

      cb({ error: () => ({ message: "Mock: unknown method " + method }) });
    },
  };
}

function bx24Call(method, params = {}) {
  return new Promise((resolve, reject) => {
    BX24.callMethod(method, params, (res) => {
      const err = res?.error?.();
      if (err) return reject(err);
      resolve(res);
    });
  });
}

function bx24CallAll(method, params = {}) {
  return new Promise((resolve, reject) => {
    const all = [];
    let page = 0;

    logStage(method, `request params=`, params);

    BX24.callMethod(method, params, function handler(res) {
      const err = res?.error?.();
      if (err) {
        logStage(method, "ERROR", err);
        return reject(err);
      }

      page += 1;

      const data = res.data();
      const items = Array.isArray(data)
        ? data
        : data && Array.isArray(data.result)
          ? data.result
          : [];

      all.push(...items);

      const more = typeof res.more === "function" ? res.more() : false;

      logStage(
        method,
        `page=${page} got=${items.length} total=${all.length} more=${more}`
      );

      if (more) {
        res.next();
        return;
      }

      resolve(all);
    });
  });
}

async function getCurrentUserId() {
  const res = await bx24Call("profile", {});
  const p = res.data();
  return Number(p.ID || p.id);
}

function extractLinkedElementId(value) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    return value.length ? String(value[0]).trim() : null;
  }

  if (typeof value === "object") {
    const vals = Object.values(value);
    return vals.length ? String(vals[0]).trim() : null;
  }

  const s = String(value).trim();
  return s || null;
}

async function loadListElements({ iblockTypeId, iblockId, select, labelForLogs = "" }) {
  const method = "lists.element.get";
  const params = { IBLOCK_TYPE_ID: iblockTypeId, IBLOCK_ID: iblockId, SELECT: select };

  logStage(labelForLogs || method, "request params=", params);

  const elements = await bx24CallAll(method, params);

  logStage(labelForLogs || method, `loaded total=${elements.length}`);
  dumpValues(`${labelForLogs || method} RAW`, elements);

  return elements;
}

// ========= Users =========
async function loadUsersToInitiator() {
  const initiator = $("#initiator");
  const hintId = "initiatorHint";
  if (!initiator) return;

  initiator.disabled = true;
  initiator.innerHTML = `<option value="">Загрузка пользователей...</option>`;
  setHint(hintId, "");

  const CACHE_KEY = "b24_active_users_v2";
  const cache = readCache(CACHE_KEY, "v2");
  let currentUserId = null;
  try {
    currentUserId = await getCurrentUserId();
  } catch (_) {}

  const applyItems = (items, sourceLabel) => {
    setSelectOptions(initiator, items, { placeholder: "Выберите инициатора" });
    if (currentUserId && items.some((x) => String(x.value) === String(currentUserId))) {
      initiator.value = String(currentUserId);
    }
    initiator.disabled = false;
    setHint(hintId, `${sourceLabel}: ${items.length}`);
  };

  if (cache.data?.length) {
    applyItems(cache.data, cache.state === "fresh" ? "Кэш (актуальный)" : "Кэш (устаревший)");
    dumpValues("Users (CACHE) mapped", cache.data);
  }

  const shouldFetch = cache.state !== "fresh";
  if (!shouldFetch && cache.data?.length) return;

  try {
    const users = await bx24CallAll("user.get", {
      FILTER: { ACTIVE: true },
      SELECT: ["ID", "NAME", "LAST_NAME"],
    });

    const currentUserIdFresh = currentUserId;

    const items = (users || [])
      .map((u) => ({
        value: u.ID,
        label: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${u.ID}`,
      }))
      .filter((x) => x.value && x.label);

    if (currentUserIdFresh && items.some((x) => String(x.value) === String(currentUserIdFresh))) {
      initiator.value = String(currentUserIdFresh);
    }
    if (currentUserIdFresh) {
      currentUserId = currentUserIdFresh;
    }

    applyItems(items, "Обновлено");
    writeCache(CACHE_KEY, "v2", items);
    dumpValues("Users mapped (fresh)", items);
  } catch (e) {
    if (!cache.data) {
      initiator.innerHTML = `<option value="">Нет доступа к списку пользователей</option>`;
      initiator.disabled = false;
    }
    const prefix = cache.data ? "Ошибка, показан кэш" : "Ошибка";
    setHint(hintId, `${prefix}: ${e?.message || String(e)}`);
  }
}

// ========= DC / PDC =========
async function loadDCAndPDC() {
  const dcSelect = $("#dealerCenter");
  const pdcSelect = $("#expenseDepartment");
  if (!dcSelect || !pdcSelect) return;

  const dcHintId = "dealerCenterHint";
  const pdcHintId = "expenseDepartmentHint";

  const DC_CACHE = cacheKey("b24_dc", REF.DC, "v4");
  const PDC_CACHE = cacheKey("b24_pdc", REF.PDC, "v4");

  dcSelect.disabled = true;
  pdcSelect.disabled = true;
  setHint(dcHintId, "");
  setHint(pdcHintId, "");

  let pdcNorm = [];

  const refreshPDC = () => {
    const dcId = dcSelect.value ? String(dcSelect.value) : "";
    const filtered = dcId ? pdcNorm.filter((x) => String(x.parentId) === dcId) : pdcNorm;

    setSelectOptions(
      pdcSelect,
      filtered.map((x) => ({ value: x.id, label: x.name })),
      { placeholder: "— Выберите ПДЦ —" }
    );
    pdcSelect.disabled = false;

    setHint(
      pdcHintId,
      dcId
        ? `ПДЦ по ДЦ ${dcId}: ${filtered.length} (всего: ${pdcNorm.length})`
        : `ПДЦ (всего): ${pdcNorm.length}`
    );

    dumpValues(dcId ? `PDC filtered by DC=${dcId}` : "PDC filtered (no DC)", filtered);
  };

  await loadWithCache({
    key: DC_CACHE,
    version: "v4",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.DC.IBLOCK_TYPE_ID,
        iblockId: REF.DC.IBLOCK_ID,
        select: ["ID", "NAME"],
        labelForLogs: "DC",
      }),
    onData: (dcElements, state) => {
      const dcItems = (dcElements || []).map((el) => ({
        value: el.ID,
        label: String(el.NAME || "").trim() || `ID ${el.ID}`,
      }));

      setSelectOptions(dcSelect, dcItems, { placeholder: "— Выберите ДЦ —" });
      dcSelect.disabled = false;
      setHint(dcHintId, `ДЦ (${state}): ${dcItems.length}`);
      dumpValues(`DC mapped (${state})`, dcItems);
    },
  });

  await loadWithCache({
    key: PDC_CACHE,
    version: "v4",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.PDC.IBLOCK_TYPE_ID,
        iblockId: REF.PDC.IBLOCK_ID,
        select: ["ID", "NAME", REF.PDC.PARENT_FIELD],
        labelForLogs: "PDC",
      }),
    onData: (pdcElements, state) => {
      pdcNorm = (pdcElements || []).map((el) => ({
        id: String(el.ID),
        name: String(el.NAME || `ID ${el.ID}`).trim(),
        parentId: extractLinkedElementId(el[REF.PDC.PARENT_FIELD]),
        parentRaw: el[REF.PDC.PARENT_FIELD],
      }));

      dumpValues(`PDC normalized (${state})`, pdcNorm);
      refreshPDC();
    },
  });

  dcSelect.addEventListener("change", () => {
    pdcSelect.disabled = true;
    refreshPDC();
  });
}
// ========= Articles / Subarticles =========
async function loadArticlesAndSubarticles() {
  const articleSelect = $("#expenseCategory");
  const subSelect = $("#expenseSubcategory");
  if (!articleSelect || !subSelect) return;

  const aHintId = "expenseCategoryHint";
  const sHintId = "expenseSubcategoryHint";

  const A_CACHE = cacheKey("b24_article", REF.EXPENSE_ARTICLE, "v4");
  const S_CACHE = cacheKey("b24_subarticle", REF.EXPENSE_SUBARTICLE, "v4");

  articleSelect.disabled = true;
  subSelect.disabled = true;
  setHint(aHintId, "");
  setHint(sHintId, "");

  let sNorm = [];

  const refreshSub = () => {
    const aId = articleSelect.value ? String(articleSelect.value) : "";
    const filtered = aId ? sNorm.filter((x) => String(x.parentId) === aId) : sNorm;

    setSelectOptions(
      subSelect,
      filtered.map((x) => ({ value: x.id, label: x.name })),
      { placeholder: "— Выберите подкатегорию —" }
    );
    subSelect.disabled = false;

    setHint(
      sHintId,
      aId
        ? `Подкатегории по статье ${aId}: ${filtered.length} (всего: ${sNorm.length})`
        : `Подкатегории (всего): ${sNorm.length}`
    );

    dumpValues(aId ? `SUBARTICLES filtered by Article=${aId}` : "SUBARTICLES filtered (no article)", filtered);
  };

  await loadWithCache({
    key: A_CACHE,
    version: "v4",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.EXPENSE_ARTICLE.IBLOCK_TYPE_ID,
        iblockId: REF.EXPENSE_ARTICLE.IBLOCK_ID,
        select: ["ID", "NAME"],
        labelForLogs: "ARTICLES",
      }),
    onData: (aElements, state) => {
      const aItems = (aElements || []).map((el) => ({
        value: String(el.ID),
        label: String(el.NAME || `ID ${el.ID}`).trim(),
      }));

      setSelectOptions(articleSelect, aItems, { placeholder: "— Выберите статью —" });
      articleSelect.disabled = false;
      setHint(aHintId, `Статьи (${state}): ${aItems.length}`);
      dumpValues(`ARTICLES mapped (${state})`, aItems);
    },
  });

  await loadWithCache({
    key: S_CACHE,
    version: "v4",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.EXPENSE_SUBARTICLE.IBLOCK_TYPE_ID,
        iblockId: REF.EXPENSE_SUBARTICLE.IBLOCK_ID,
        select: ["ID", "NAME", REF.EXPENSE_SUBARTICLE.PARENT_FIELD],
        labelForLogs: "SUBARTICLES",
      }),
    onData: (sElements, state) => {
      sNorm = (sElements || []).map((el) => ({
        id: String(el.ID),
        name: String(el.NAME || `ID ${el.ID}`).trim(),
        parentId: extractLinkedElementId(el[REF.EXPENSE_SUBARTICLE.PARENT_FIELD]),
        parentRaw: el[REF.EXPENSE_SUBARTICLE.PARENT_FIELD],
      }));

      dumpValues(`SUBARTICLES normalized (${state})`, sNorm);
      refreshSub();
    },
  });

  articleSelect.addEventListener("change", () => {
    subSelect.disabled = true;
    refreshSub();
  });
}
// ========= Currencies =========
async function loadCurrencies() {
  const currency = $("#currency");
  if (!currency) return;

  const hintId = "currencyHint";
  setHint(hintId, "");

  const fallback = [
    { value: "KGS", label: "KGS — сом" },
    { value: "USD", label: "USD — доллар" },
    { value: "EUR", label: "EUR — евро" },
    { value: "RUB", label: "RUB — рубль" },
  ];

  const CUR_CACHE = "b24_currencies_v2";

  await loadWithCache({
    key: CUR_CACHE,
    version: "v2",
    fetcher: () => bx24CallAll("crm.currency.list", {}),
    onData: (list, state) => {
      const items = (list || []).map((c) => ({
        value: c.CURRENCY,
        label: `${c.CURRENCY}${c.FULL_NAME ? " — " + c.FULL_NAME : ""}`,
      }));

      const dataset = items.length ? items : fallback;
      setSelectOptions(currency, dataset, { placeholder: "— Выберите валюту —" });

      const kgs = dataset.find((i) => i.value === "KGS");
      if (kgs) currency.value = "KGS";

      setHint(hintId, `Валюты (${state}): ${dataset.length}`);
      dumpValues("Currencies mapped", dataset);
    },
  }).catch(() => {
    setSelectOptions(currency, fallback, { placeholder: "— Выберите валюту —" });
    setHint(hintId, `Валюты (fallback): ${fallback.length}`);
  });
}
// ========= Selects: search + styling =========
function enhanceSelectWithSearch(select) {
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
  toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.4 9.6a1 1 0 0 1 1.2-.2l4.4 2.4 4.4-2.4a1 1 0 1 1 1 1.74l-4.9 2.7a1 1 0 0 1-.98 0l-4.9-2.7a1 1 0 0 1-.3-1.54Z"/></svg>';

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
    return opt0 ? opt0.textContent.trim() : "Р’С‹Р±РµСЂРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ";
  };

  const closeList = () => wrapper.classList.remove("is-open");
  const openList = () => {
    wrapper.classList.add("is-open");
    renderList(searchInput.value);
  };

  const syncFromSelect = () => {
    const selected = select.options[select.selectedIndex];
    if (selected && selected.value) {
      searchInput.value = selected.textContent;
    } else {
      searchInput.value = "";
    }
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
    const filtered = term
      ? options.filter((o) => o.textContent.toLowerCase().includes(term))
      : options;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "select-search__empty";
      empty.textContent = "РќРµ РЅР°Р№РґРµРЅРѕ";
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
      item.addEventListener("click", () => chooseOption(opt.value));
      list.appendChild(item);
    });
  };

  searchInput.addEventListener("focus", () => openList());
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

function setupSelectSearch() {
  document.querySelectorAll("select.control").forEach(enhanceSelectWithSearch);
}

// ========= File input UI =========
function setupFilePicker() {
  const wrapper = document.querySelector(".input-file");
  const input = wrapper?.querySelector('input[type="file"]');
  const text = wrapper?.querySelector(".input-file-text");
  if (!wrapper || !input || !text) return;

  const placeholder = text.dataset.placeholder || "Р¤Р°Р№Р»С‹ РЅРµ РІС‹Р±СЂР°РЅС‹";

  const update = () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      text.textContent = placeholder;
      return;
    }

    if (files.length === 1) {
      text.textContent = files[0].name;
      return;
    }

    const visible = files.slice(0, 2).map((f) => f.name).join(", ");
    const extra = files.length - 2;
    text.textContent = extra > 0 ? `${visible} + РµС‰С‘ ${extra}` : visible;
  };

  update();
  input.addEventListener("change", update);
}

// ========= Submit =========
function setupSubmit() {
  const form = $("#expenseForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) {
      obj[k] = v instanceof File ? v.name : v;
    }

    console.log("FORM DATA:", obj);
    logDebug(obj);
  });
}

// ========= Init =========
BX24.init(async () => {
  setupSelectSearch();
  await Promise.all([loadUsersToInitiator(), loadCurrencies()]);

  await loadDCAndPDC();
  await loadArticlesAndSubarticles();

  setupFilePicker();
  setupSubmit();
  logDebug("Р“РѕС‚РѕРІРѕ.");
});











