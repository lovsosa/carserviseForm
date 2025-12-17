const API_URL = "https://carservice.bitrix24.kz/rest/25585/law35drn41ly2wm1/";
const $ = (sel) => document.querySelector(sel);

const DEBUG_DUMP_VALUES = true; // ✅ если слишком много логов — поставь false

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
  { placeholder = "— Выберите —", valueKey = "value", labelKey = "label" } = {}
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

// ---------- DEBUG HELPERS ----------
function dumpValues(label, items) {
  if (!DEBUG_DUMP_VALUES) return;

  try {
    console.groupCollapsed(`🔎 ${label} (count=${items?.length ?? 0})`);
    console.log(items); // ✅ все значения (как просил)
    // если это объекты с id/name — удобно видеть таблицей
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
            { ID: 1, NAME: "Тест", LAST_NAME: "Пользователь" },
            { ID: 2, NAME: "Иван", LAST_NAME: "Иванов" },
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
            { CURRENCY: "KGS", FULL_NAME: "Кыргызский сом" },
            { CURRENCY: "USD", FULL_NAME: "Доллар США" },
            { CURRENCY: "EUR", FULL_NAME: "Евро" },
            { CURRENCY: "RUB", FULL_NAME: "Российский рубль" },
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

/**
 * ✅ Правильная пагинация для BX24 JS SDK: res.more()/res.next()
 * (лимит 50 — норм, просто тянем все страницы)
 */
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
        res.next(); // подтянет следующую страницу и снова вызовет handler
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

  const CACHE_KEY = "b24_active_users_v1";
  const cached = sessionStorage.getItem(CACHE_KEY);

  if (cached) {
    try {
      const items = JSON.parse(cached);
      setSelectOptions(initiator, items, { placeholder: "Выберите инициатора" });

      try {
        const currentUserId = await getCurrentUserId();
        if (items.some((x) => String(x.value) === String(currentUserId))) {
          initiator.value = String(currentUserId);
        }
      } catch (_) { }

      initiator.disabled = false;
      setHint(hintId, `Пользователи (кеш): ${items.length}`);

      dumpValues("Users (CACHE) mapped", items);
      return;
    } catch (_) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }

  try {
    const users = await bx24CallAll("user.get", {
      FILTER: { ACTIVE: true },
      SELECT: ["ID", "NAME", "LAST_NAME"],
    });

    const currentUserId = await getCurrentUserId();

    const items = (users || [])
      .map((u) => ({
        value: u.ID,
        label: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${u.ID}`,
      }))
      .filter((x) => x.value && x.label);

    setSelectOptions(initiator, items, { placeholder: "Выберите инициатора" });

    if (items.some((x) => String(x.value) === String(currentUserId))) {
      initiator.value = String(currentUserId);
    }

    initiator.disabled = false;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(items));
    setHint(hintId, `Пользователи: ${items.length}`);

    dumpValues("Users mapped", items);
  } catch (e) {
    initiator.innerHTML = `<option value="">Не удалось загрузить пользователей</option>`;
    initiator.disabled = false;
    setHint(hintId, `Ошибка: ${e?.message || String(e)}`);
  }
}

// ========= DC / PDC =========
async function loadDCAndPDC() {
  const dcSelect = $("#dealerCenter");
  const pdcSelect = $("#expenseDepartment");
  if (!dcSelect || !pdcSelect) return;

  const dcHintId = "dealerCenterHint";
  const pdcHintId = "expenseDepartmentHint";

  const DC_CACHE = cacheKey("b24_dc", REF.DC, "v3");
  const PDC_CACHE = cacheKey("b24_pdc", REF.PDC, "v3");

  dcSelect.disabled = true;
  pdcSelect.disabled = true;
  setHint(dcHintId, "");
  setHint(pdcHintId, "");

  // --- ДЦ ---
  let dcElements;
  const dcCached = sessionStorage.getItem(DC_CACHE);
  if (dcCached) {
    dcElements = JSON.parse(dcCached);
    logStage("DC", `loaded from CACHE total=${dcElements.length}`);
    dumpValues("DC (CACHE) RAW", dcElements);
  } else {
    dcElements = await loadListElements({
      iblockTypeId: REF.DC.IBLOCK_TYPE_ID,
      iblockId: REF.DC.IBLOCK_ID,
      select: ["ID", "NAME"],
      labelForLogs: "DC",
    });
    sessionStorage.setItem(DC_CACHE, JSON.stringify(dcElements));
  }

  const dcItems = (dcElements || []).map((el) => ({
    value: el.ID,
    label: String(el.NAME || "").trim() || `ID ${el.ID}`,
  }));

  setSelectOptions(dcSelect, dcItems, { placeholder: "— Выберите ДЦ —" });
  dcSelect.disabled = false;
  setHint(dcHintId, `ДЦ: ${dcItems.length}`);

  dumpValues("DC mapped", dcItems);

  // --- ПДЦ ---
  let pdcElements;
  const pdcCached = sessionStorage.getItem(PDC_CACHE);
  if (pdcCached) {
    pdcElements = JSON.parse(pdcCached);
    logStage("PDC", `loaded from CACHE total=${pdcElements.length}`);
    dumpValues("PDC (CACHE) RAW", pdcElements);
  } else {
    pdcElements = await loadListElements({
      iblockTypeId: REF.PDC.IBLOCK_TYPE_ID,
      iblockId: REF.PDC.IBLOCK_ID,
      select: ["ID", "NAME", REF.PDC.PARENT_FIELD],
      labelForLogs: "PDC",
    });
    sessionStorage.setItem(PDC_CACHE, JSON.stringify(pdcElements));
  }

  const pdcNorm = (pdcElements || []).map((el) => ({
    id: String(el.ID),
    name: String(el.NAME || `ID ${el.ID}`).trim(),
    parentId: extractLinkedElementId(el[REF.PDC.PARENT_FIELD]),
    parentRaw: el[REF.PDC.PARENT_FIELD],
  }));

  dumpValues("PDC normalized", pdcNorm);

  function refreshPDC() {
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
  }

  refreshPDC();
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

  const A_CACHE = cacheKey("b24_article", REF.EXPENSE_ARTICLE, "v3");
  const S_CACHE = cacheKey("b24_subarticle", REF.EXPENSE_SUBARTICLE, "v3");

  articleSelect.disabled = true;
  subSelect.disabled = true;
  setHint(aHintId, "");
  setHint(sHintId, "");

  // --- статьи ---
  let aElements;
  const aCached = sessionStorage.getItem(A_CACHE);
  if (aCached) {
    aElements = JSON.parse(aCached);
    logStage("ARTICLES", `loaded from CACHE total=${aElements.length}`);
    dumpValues("ARTICLES (CACHE) RAW", aElements);
  } else {
    aElements = await loadListElements({
      iblockTypeId: REF.EXPENSE_ARTICLE.IBLOCK_TYPE_ID,
      iblockId: REF.EXPENSE_ARTICLE.IBLOCK_ID,
      select: ["ID", "NAME"],
      labelForLogs: "ARTICLES",
    });
    sessionStorage.setItem(A_CACHE, JSON.stringify(aElements));
  }

  const aItems = (aElements || []).map((el) => ({
    value: String(el.ID),
    label: String(el.NAME || `ID ${el.ID}`).trim(),
  }));

  setSelectOptions(articleSelect, aItems, { placeholder: "— Выберите статью —" });
  articleSelect.disabled = false;
  setHint(aHintId, `Статьи: ${aItems.length}`);

  dumpValues("ARTICLES mapped", aItems);

  // --- подстатьи ---
  let sElements;
  const sCached = sessionStorage.getItem(S_CACHE);
  if (sCached) {
    sElements = JSON.parse(sCached);
    logStage("SUBARTICLES", `loaded from CACHE total=${sElements.length}`);
    dumpValues("SUBARTICLES (CACHE) RAW", sElements);
  } else {
    sElements = await loadListElements({
      iblockTypeId: REF.EXPENSE_SUBARTICLE.IBLOCK_TYPE_ID,
      iblockId: REF.EXPENSE_SUBARTICLE.IBLOCK_ID,
      select: ["ID", "NAME", REF.EXPENSE_SUBARTICLE.PARENT_FIELD],
      labelForLogs: "SUBARTICLES",
    });
    sessionStorage.setItem(S_CACHE, JSON.stringify(sElements));
  }

  const sNorm = (sElements || []).map((el) => ({
    id: String(el.ID),
    name: String(el.NAME || `ID ${el.ID}`).trim(),
    parentId: extractLinkedElementId(el[REF.EXPENSE_SUBARTICLE.PARENT_FIELD]),
    parentRaw: el[REF.EXPENSE_SUBARTICLE.PARENT_FIELD],
  }));

  dumpValues("SUBARTICLES normalized", sNorm);

  function refreshSub() {
    const aId = articleSelect.value ? String(articleSelect.value) : "";
    const filtered = aId ? sNorm.filter((x) => String(x.parentId) === aId) : sNorm;

    setSelectOptions(
      subSelect,
      filtered.map((x) => ({ value: x.id, label: x.name })),
      { placeholder: "— Выберите подстатью —" }
    );
    subSelect.disabled = false;

    setHint(
      sHintId,
      aId
        ? `Подстатьи по статье ${aId}: ${filtered.length} (всего: ${sNorm.length})`
        : `Подстатьи (всего): ${sNorm.length}`
    );

    dumpValues(aId ? `SUBARTICLES filtered by Article=${aId}` : "SUBARTICLES filtered (no article)", filtered);
  }

  refreshSub();
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
    { value: "KGS", label: "KGS — Сом" },
    { value: "USD", label: "USD — Доллар" },
    { value: "EUR", label: "EUR — Евро" },
    { value: "RUB", label: "RUB — Рубль" },
  ];

  try {
    const list = await bx24CallAll("crm.currency.list", {});
    const items = (list || []).map((c) => ({
      value: c.CURRENCY,
      label: `${c.CURRENCY}${c.FULL_NAME ? " — " + c.FULL_NAME : ""}`,
    }));

    setSelectOptions(currency, items.length ? items : fallback, { placeholder: "— Выберите валюту —" });

    const kgs = items.find((i) => i.value === "KGS");
    if (kgs) currency.value = "KGS";

    setHint(hintId, `Валюты: ${items.length ? items.length : fallback.length}`);
    dumpValues("Currencies mapped", items.length ? items : fallback);
  } catch (_) {
    setSelectOptions(currency, fallback, { placeholder: "— Выберите валюту —" });
    setHint(hintId, `Валюты: ${fallback.length} (fallback)`);
    dumpValues("Currencies fallback", fallback);
  }
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
  await Promise.all([loadUsersToInitiator(), loadCurrencies()]);

  await loadDCAndPDC();
  await loadArticlesAndSubarticles();

  setupSubmit();
  logDebug("Готово.");
});
