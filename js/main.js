const API_URL = 'https://carservice.bitrix24.kz/rest/25585/law35drn41ly2wm1/';
const $ = (sel) => document.querySelector(sel);

const debugEl = $("#debug");
const logDebug = (obj) => {
  debugEl.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
};

function setSelectOptions(selectEl, items, { placeholder = "— Выберите —", valueKey = "value", labelKey = "label" } = {}) {
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

// ========= Bitrix environment / mock =========
const isInBitrix = typeof window.BX24 !== "undefined";

if (!isInBitrix) {
  // Мок, чтобы UI можно было гонять локально без Bitrix24
  window.BX24 = {
    init: (cb) => cb(),
    callMethod: (method, params, cb) => {
      // Минимальные фейковые ответы
      if (method === "user.get") {
        cb({
          error: () => null,
          data: () => ([
            { ID: 1, NAME: "Тест", LAST_NAME: "Пользователь", EMAIL: "test@local" },
            { ID: 2, NAME: "Иван", LAST_NAME: "Иванов", EMAIL: "ivan@local" },
          ]),
          more: () => false,
          next: () => { }
        });
        return;
      }

      if (method === "crm.currency.list") {
        cb({
          error: () => null,
          data: () => ([
            { CURRENCY: "KGS", FULL_NAME: "Кыргызский сом" },
            { CURRENCY: "USD", FULL_NAME: "Доллар США" },
            { CURRENCY: "EUR", FULL_NAME: "Евро" },
            { CURRENCY: "RUB", FULL_NAME: "Российский рубль" },
          ]),
          more: () => false,
          next: () => { }
        });
        return;
      }

      cb({ error: () => ({ message: "Mock: unknown method " + method }) });
    }
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

// Получить все страницы
async function bx24CallAll(method, params = {}) {
  const all = [];

  return new Promise((resolve, reject) => {
    BX24.callMethod(method, params, function handler(res) {
      const err = res?.error?.();
      if (err) return reject(err);

      const chunk = res.data();
      // user.get возвращает массив; crm.currency.list тоже массив
      if (Array.isArray(chunk)) all.push(...chunk);

      if (res.more && res.more()) {
        res.next();
        return;
      }

      resolve(all);
    });
  });
}

// ========= Load data =========
async function loadUsersToInitiator() {
  const initiator = $("#initiator");
  const hint = $("#initiatorHint");

  // UI: пока грузим — блокируем
  initiator.disabled = true;
  initiator.innerHTML = `<option value="">Загрузка пользователей...</option>`;
  hint.textContent = "";

  // --- 1) Кеш на время сессии (ускоряет повторные F5)
  const CACHE_KEY = "b24_active_users_v1";
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const items = JSON.parse(cached);
      setSelectOptions(initiator, items, { placeholder: "— Выберите инициатора —" });
      initiator.disabled = false;
      hint.textContent = `Пользователи из кеша: ${items.length}`;
      return;
    } catch (_) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }

  try {
    // --- 2) Тянем только активных и только нужные поля
    // В Bitrix24 уволенные обычно имеют ACTIVE = false/`N`.
    const users = await bx24CallAll("user.get", {
      FILTER: { ACTIVE: true }, // либо ACTIVE: "Y" если понадобится
      SELECT: ["ID", "NAME", "LAST_NAME"] // минимальный набор для dropdown
    });

    const items = (users || [])
      .map(u => ({
        value: u.ID,
        label: `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${u.ID}`
      }))
      // на всякий: выкинем пустые/битые
      .filter(x => x.value && x.label);

    setSelectOptions(initiator, items, { placeholder: "— Выберите инициатора —" });
    initiator.disabled = false;

    // кешируем
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(items));

    hint.textContent = isInBitrix
      ? `Загружено активных пользователей: ${items.length}`
      : `Локальный режим (мок). Пользователей: ${items.length}`;
  } catch (e) {
    initiator.innerHTML = `<option value="">Не удалось загрузить пользователей</option>`;
    initiator.disabled = false;
    hint.textContent = `Ошибка загрузки пользователей: ${e?.message || String(e)}`;
  }
}


async function loadCurrencies() {
  const currency = $("#currency");

  const fallback = [
    { value: "KGS", label: "KGS — Сом" },
    { value: "USD", label: "USD — Доллар" },
    { value: "EUR", label: "EUR — Евро" },
    { value: "RUB", label: "RUB — Рубль" }
  ];

  try {
    const list = await bx24CallAll("crm.currency.list", {});
    const items = (list || []).map(c => ({
      value: c.CURRENCY,
      label: `${c.CURRENCY}${c.FULL_NAME ? " — " + c.FULL_NAME : ""}`
    }));

    if (!items.length) {
      setSelectOptions(currency, fallback, { placeholder: "— Выберите валюту —" });
      return;
    }

    setSelectOptions(currency, items, { placeholder: "— Выберите валюту —" });

    // по умолчанию поставить KGS если есть
    const kgs = items.find(i => i.value === "KGS");
    if (kgs) currency.value = "KGS";
  } catch (e) {
    setSelectOptions(currency, fallback, { placeholder: "— Выберите валюту —" });
  }
}

// ========= TODO места под зависимую логику =========
function setupFutureDependencies() {
  const dealerCenter = $("#dealerCenter");
  const expenseDepartment = $("#expenseDepartment");
  const expenseCategory = $("#expenseCategory");
  const expenseSubcategory = $("#expenseSubcategory");

  dealerCenter.addEventListener("change", () => {
    // TODO:
    // 1) получить список подразделений по выбранному дилерскому центру
    // 2) заполнить expenseDepartment options
    // Сейчас просто заглушка:
    // setSelectOptions(expenseDepartment, filteredItems)
    console.log("TODO: dealerCenter changed:", dealerCenter.value);
  });

  expenseCategory.addEventListener("change", () => {
    // TODO:
    // 1) получить подстатьи по статье
    // 2) заполнить expenseSubcategory options
    console.log("TODO: expenseCategory changed:", expenseCategory.value);
  });
}

// ========= Submit =========
function setupSubmit() {
  const form = $("#expenseForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fd = new FormData(form);

    // Превратим в объект (для логов). Файлы оставим как имена.
    const obj = {};
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) {
        if (!obj[k]) obj[k] = [];
        obj[k].push(v.name);
      } else {
        obj[k] = v;
      }
    }

    console.log("FORM DATA:", obj);
    logDebug(obj);

    // TODO: сюда добавим реальную отправку
    // - либо в Bitrix24 (создание смарт-процесса / сделки / элемента списка)
    // - либо на webhook n8n
  });
}

// ========= Init =========
BX24.init(async () => {
  await Promise.all([
    loadUsersToInitiator(),
    loadCurrencies(),
  ]);

  setupFutureDependencies();
  setupSubmit();

  logDebug("Готово. Заполни форму и нажми Submit (данные пока логируются).");
});
