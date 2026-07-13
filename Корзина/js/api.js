import { SETTINGS } from "./refs.js";

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
          next: () => {},
        });
        return;
      }

      if (method === "crm.currency.list") {
        cb({
          error: () => null,
          data: () => [
            { CURRENCY: "KGS", FULL_NAME: "Киргизский сом" },
            { CURRENCY: "USD", FULL_NAME: "Доллар США" },
            { CURRENCY: "EUR", FULL_NAME: "Евро" },
            { CURRENCY: "RUB", FULL_NAME: "Российский рубль" },
          ],
          more: () => false,
          next: () => {},
        });
        return;
      }

      if (method === "profile") {
        cb({
          error: () => null,
          data: () => ({ ID: 1 }),
          more: () => false,
          next: () => {},
        });
        return;
      }

      cb({ error: () => ({ message: "Mock: unknown method " + method }) });
    },
  };
}

export function bx24Call(method, params = {}) {
  return new Promise((resolve, reject) => {
    BX24.callMethod(method, params, (res) => {
      const err = res?.error?.();
      if (err) return reject(err);
      resolve(res);
    });
  });
}

export function bx24CallAll(method, params = {}) {
  return new Promise((resolve, reject) => {
    const all = [];
    let page = 0;
    if (SETTINGS.DEBUG_DUMP_VALUES) console.log(`[${method}] params`, params);

    BX24.callMethod(method, params, function handler(res) {
      const err = res?.error?.();
      if (err) {
        if (SETTINGS.DEBUG_DUMP_VALUES) console.log(`[${method}] ERROR`, err);
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

      if (SETTINGS.DEBUG_DUMP_VALUES) {
        console.log(`[${method}] page=${page} got=${items.length} total=${all.length} more=${more}`);
      }

      if (more) {
        res.next();
        return;
      }

      resolve(all);
    });
  });
}

export async function loadListElements({ iblockTypeId, iblockId, select, labelForLogs = "" }) {
  const method = "lists.element.get";
  const params = { IBLOCK_TYPE_ID: iblockTypeId, IBLOCK_ID: iblockId, SELECT: select };
  if (SETTINGS.DEBUG_DUMP_VALUES) console.log(`[${labelForLogs || method}] request`, params);
  const elements = await bx24CallAll(method, params);
  if (SETTINGS.DEBUG_DUMP_VALUES) console.log(`[${labelForLogs || method}] loaded`, elements.length);
  return elements;
}

export async function getCurrentUserId() {
  const res = await bx24Call("profile", {});
  const p = res.data();
  return Number(p.ID || p.id);
}
