import { REF } from "./refs.js";
import { loadWithCache, readCache, writeCache } from "./cache.js";
import { bx24CallAll, loadListElements, getCurrentUserId } from "./api.js";
import { setHint, setSelectOptions, extractLinkedElementId } from "./utils.js";

export let dcSourceRaw = [];

export async function loadUsersToInitiator() {
  const initiator = document.querySelector("#initiator");
  const initiatorPosition = document.querySelector("#initiatorPosition");
  const hintId = "initiatorHint";
  if (!initiator) return;

  // --- helper: единичный вызов BX24 ---
  const bx24Call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      BX24.callMethod(method, params, (res) => {
        if (res.error()) reject(new Error(res.error()));
        else resolve(res.data());
      });
    });

  // --- helper: подгрузка должности по ID пользователя ---
  const positionMemCache = (window.__posMemCache ||= {}); // чтобы не дергать API повторно
  const loadPositionByUserId = async (userId) => {
    if (!initiatorPosition) return;

    const id = String(userId || "").trim();
    if (!id) {
      initiatorPosition.value = "";
      initiatorPosition.placeholder = "Должность не указана";
      return;
    }

    // из памяти
    if (Object.prototype.hasOwnProperty.call(positionMemCache, id)) {
      const pos = positionMemCache[id];
      initiatorPosition.value = pos || "";
      initiatorPosition.placeholder = pos ? "" : "Должность не указана";
      return;
    }

    // загрузка
    initiatorPosition.value = "";
    initiatorPosition.placeholder = "Загрузка должности...";

    try {
      // user.get вернет массив пользователей
      const data = await bx24Call("user.get", {
        FILTER: { ID: id },
        SELECT: ["ID", "WORK_POSITION"],
      });

      const u = Array.isArray(data) ? data[0] : data;
      const pos = String(u?.WORK_POSITION || "").trim();

      positionMemCache[id] = pos; // кешируем в памяти
      initiatorPosition.value = pos || "";
      initiatorPosition.placeholder = pos ? "" : "Должность не указана";
    } catch (e) {
      positionMemCache[id] = ""; // чтобы не долбить API при ошибке
      initiatorPosition.value = "";
      initiatorPosition.placeholder = "Должность не указана";
      // если хочешь — можно логнуть:
      // console.error("Position load error:", e);
    }
  };

  initiator.disabled = true;
  initiator.innerHTML = `<option value="">Загрузка пользователей...</option>`;
  setHint(hintId, "");

  const CACHE_KEY = "b24_active_users_v2";
  const cache = readCache(CACHE_KEY, "v2");
  let currentUserId = null;

  try {
    currentUserId = await getCurrentUserId();
  } catch (_) {}

  const bindChangeOnce = () => {
    if (initiator.dataset.posBound === "1") return;
    initiator.dataset.posBound = "1";
    initiator.addEventListener("change", () => loadPositionByUserId(initiator.value));
  };

  const applyItems = (items, sourceLabel) => {
    setSelectOptions(initiator, items, { placeholder: "Выберите инициатора" });

    if (currentUserId && items.some((x) => String(x.value) === String(currentUserId))) {
      initiator.value = String(currentUserId);
    }

    initiator.disabled = false;
    setHint(hintId, `${sourceLabel}: ${items.length}`);

    bindChangeOnce();
    loadPositionByUserId(initiator.value); // важно: подгрузить должность для текущего выбранного
  };

  // 1) кэш
  if (cache?.data?.length) {
    applyItems(cache.data, cache.state === "fresh" ? "Кэш (актуальный)" : "Кэш (устаревший)");
  }

  const shouldFetch = cache?.state !== "fresh";
  if (!shouldFetch && cache?.data?.length) return;

  // 2) свежие пользователи (БЕЗ должности)
  try {
    const users = await bx24CallAll("user.get", {
      FILTER: { ACTIVE: true },
      SELECT: ["ID", "NAME", "LAST_NAME"], // <-- должность не берем тут
    });

    const items = (users || [])
      .map((u) => ({
        value: u.ID,
        label: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${u.ID}`,
      }))
      .filter((x) => x.value && x.label);

    applyItems(items, "Обновлено");
    writeCache(CACHE_KEY, "v2", items);
  } catch (e) {
    if (!cache?.data) {
      initiator.innerHTML = `<option value="">Нет доступа к списку пользователей</option>`;
      initiator.disabled = false;
    }
    const prefix = cache?.data ? "Ошибка, показан кэш" : "Ошибка";
    setHint(hintId, `${prefix}: ${e?.message || String(e)}`);
  }
}


export async function loadDCAndPDC() {
  const dcSelect = document.querySelector("#dealerCenter");
  const pdcSelect = document.querySelector("#expenseDepartment");
  if (!dcSelect || !pdcSelect) return;

  const dcHintId = "dealerCenterHint";
  const pdcHintId = "expenseDepartmentHint";

  const DC_CACHE = `b24_dc_${REF.DC.IBLOCK_ID}_v5`;
  const PDC_CACHE = `b24_pdc_${REF.PDC.IBLOCK_ID}_v4`;

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
      { placeholder: "Выберите подразделение" }
    );
    pdcSelect.disabled = false;

    setHint(
      pdcHintId,
      dcId
        ? `ПДЦ по ДЦ ${dcId}: ${filtered.length} (всего: ${pdcNorm.length})`
        : `ПДЦ (всего): ${pdcNorm.length}`
    );
  };

  await loadWithCache({
    key: DC_CACHE,
    version: "v5",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.DC.IBLOCK_TYPE_ID,
        iblockId: REF.DC.IBLOCK_ID,
        select: ["ID", "NAME", REF.DC.TARGET_FIELD],
        labelForLogs: "DC",
      }),
    onData: (dcElements, state) => {
      dcSourceRaw = dcElements || [];
      const dcItems = dcSourceRaw.map((el) => ({
        value: el.ID,
        label: String(el.NAME || "").trim() || `ID ${el.ID}`,
        targetId: el[REF.DC.TARGET_FIELD] || null,
      }));

      setSelectOptions(dcSelect, dcItems, { placeholder: "Выберите дилерский центр" });
      dcSelect.disabled = false;
      setHint(dcHintId, `ДЦ (${state}): ${dcItems.length}`);
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
      refreshPDC();
    },
  });

  dcSelect.addEventListener("change", () => {
    pdcSelect.disabled = true;
    refreshPDC();
  });
}

export async function loadArticlesAndSubarticles() {
  const articleSelect = document.querySelector("#expenseCategory");
  const subSelect = document.querySelector("#expenseSubcategory");
  if (!articleSelect || !subSelect) return;

  const aHintId = "expenseCategoryHint";
  const sHintId = "expenseSubcategoryHint";

  const A_CACHE = `b24_article_${REF.EXPENSE_ARTICLE.IBLOCK_ID}_v4`;
  const S_CACHE = `b24_subarticle_${REF.EXPENSE_SUBARTICLE.IBLOCK_ID}_v4`;

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
      { placeholder: "Выберите подстатью" }
    );
    subSelect.disabled = false;

    setHint(
      sHintId,
      aId
        ? `Подкатегории по статье ${aId}: ${filtered.length} (всего: ${sNorm.length})`
        : `Подкатегории (всего): ${sNorm.length}`
    );
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

      setSelectOptions(articleSelect, aItems, { placeholder: "Выберите статью" });
      articleSelect.disabled = false;
      setHint(aHintId, `Статьи (${state}): ${aItems.length}`);
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
      refreshSub();
    },
  });

  articleSelect.addEventListener("change", () => {
    subSelect.disabled = true;
    refreshSub();
  });
}

export async function loadPaymentSelects() {
  const typeSelect = document.querySelector("#paymentType");
  const timingSelect = document.querySelector("#paymentTiming");
  if (!typeSelect || !timingSelect) return;

  const TYPE_CACHE = `b24_payment_type_${REF.PAYMENT_TYPE.IBLOCK_ID}_v1`;
  const TIMING_CACHE = `b24_payment_timing_${REF.PAYMENT_TIMING.IBLOCK_ID}_v1`;

  typeSelect.disabled = true;
  timingSelect.disabled = true;

  await loadWithCache({
    key: TYPE_CACHE,
    version: "v1",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.PAYMENT_TYPE.IBLOCK_TYPE_ID,
        iblockId: REF.PAYMENT_TYPE.IBLOCK_ID,
        select: ["ID", "NAME"],
        labelForLogs: "PAYMENT_TYPE",
      }),
    onData: (items, state) => {
      const mapped = (items || []).map((el) => ({
        value: String(el.ID),
        label: String(el.NAME || `ID ${el.ID}`).trim(),
      }));
      setSelectOptions(typeSelect, mapped, { placeholder: "Выберите способ оплаты" });
      typeSelect.disabled = false;
      setHint("paymentTypeHint", `Способы (${state}): ${mapped.length}`);
    },
  }).catch(() => {
    typeSelect.disabled = false;
  });

  await loadWithCache({
    key: TIMING_CACHE,
    version: "v1",
    fetcher: () =>
      loadListElements({
        iblockTypeId: REF.PAYMENT_TIMING.IBLOCK_TYPE_ID,
        iblockId: REF.PAYMENT_TIMING.IBLOCK_ID,
        select: ["ID", "NAME"],
        labelForLogs: "PAYMENT_TIMING",
      }),
    onData: (items, state) => {
      const mapped = (items || []).map((el) => ({
        value: String(el.ID),
        label: String(el.NAME || `ID ${el.ID}`).trim(),
      }));
      setSelectOptions(timingSelect, mapped, { placeholder: "Форма оплаты" });
      timingSelect.disabled = false;
      setHint("paymentTimingHint", `Сроки (${state}): ${mapped.length}`);
    },
  }).catch(() => {
    timingSelect.disabled = false;
  });
}

export async function loadCurrencies() {
  const currency = document.querySelector("#currency");
  if (!currency) return;

  const hintId = "currencyHint";
  setHint(hintId, "");

  const fallback = [
    { value: "KGS", label: "KGS - сом" },
    { value: "USD", label: "USD - доллар" },
    { value: "EUR", label: "EUR - евро" },
    { value: "RUB", label: "RUB - рубль" },
  ];

  const CUR_CACHE = "b24_currencies_v2";

  await loadWithCache({
    key: CUR_CACHE,
    version: "v2",
    fetcher: () => bx24CallAll("crm.currency.list", {}),
    onData: (list, state) => {
      const items = (list || []).map((c) => ({
        value: c.CURRENCY,
        label: `${c.CURRENCY}${c.FULL_NAME ? " - " + c.FULL_NAME : ""}`,
      }));

      const dataset = items.length ? items : fallback;
      setSelectOptions(currency, dataset, { placeholder: "Выберите валюту" });

      const kgs = dataset.find((i) => i.value === "KGS");
      if (kgs) currency.value = "KGS";

      setHint(hintId, `Валюты (${state}): ${dataset.length}`);
    },
  }).catch(() => {
    setSelectOptions(currency, fallback, { placeholder: "Выберите валюту" });
    setHint(hintId, `Валюты (fallback): ${fallback.length}`);
  });
}
