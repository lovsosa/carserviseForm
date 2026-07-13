import { REF, bizopsList } from "./refs.js";
import {
  extractLinkedElementId,
  showSubmitOverlay,
  hideSubmitOverlay,
} from "./utils.js";
import { bx24Call } from "./api.js";
import { dcSourceRaw } from "./loaders.js";

function buildPayload(formValues) {
  const payload = {};

  // SUMMA = "<amount>|<currency>"
  const amount = formValues.amount ? String(formValues.amount).trim() : "";
  const currency = formValues.currency
    ? String(formValues.currency).trim()
    : "";
  if (amount)
    payload[bizopsList.amount] = currency ? `${amount}|${currency}` : amount;

  Object.entries(bizopsList).forEach(([formKey, bpKey]) => {
    if (formKey === "amount") return;
    if (formKey === "currency") return; // currency is stored together with amount
    if (formKey === "files") return; // files handled separately
    let val = formValues[formKey];
    if (formKey === "needText" && (!val || String(val).trim() === "")) {
      val = "-"; // required field, send dash if empty
    }
    if (val == null || val === "") return;
    payload[bpKey] = val;
  });

  return payload;
}

function findTargetIblockIdByDC(dcId) {
  if (!dcId || !dcSourceRaw.length) return null;
  const found = dcSourceRaw.find((el) => String(el.ID) === String(dcId));
  const rawTarget = found ? found[REF.DC.TARGET_FIELD] : null;
  return rawTarget ? extractLinkedElementId(rawTarget) : null;
}

const fieldMapCache = {};

async function getFieldMap(iblockId) {
  if (fieldMapCache[iblockId]) return fieldMapCache[iblockId];
  try {
    const res = await bx24Call("lists.field.get", {
      IBLOCK_TYPE_ID: REF.DC.IBLOCK_TYPE_ID,
      IBLOCK_ID: iblockId,
    });

    let data = typeof res?.data === "function" ? res.data() : res?.data;
    if (!data && res?.answer?.result) data = res.answer;

    const rawFields = Array.isArray(data)
      ? data
      : data?.result && typeof data.result === "object"
        ? Object.values(data.result)
        : data && typeof data === "object"
          ? Object.values(data)
          : [];

    const map = {};
    rawFields.forEach((f) => {
      if (f?.CODE && f?.FIELD_ID) {
        map[f.CODE] = f.FIELD_ID;
        map[f.CODE.toLowerCase()] = f.FIELD_ID;
        map[f.CODE.toUpperCase()] = f.FIELD_ID;
      }
    });
    fieldMapCache[iblockId] = map;
    // console.log("Field map (CODE -> FIELD_ID) loaded:", map);
    return map;
  } catch (e) {
    console.error("lists.field.get failed:", e?.message || e, e);
    throw e;
  }
}

async function fileToBitrix(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(file);
  });

  const base64 =
    typeof dataUrl === "string" && dataUrl.includes(",")
      ? dataUrl.split(",")[1]
      : dataUrl;

  return [file.name, base64];
}

export async function submitForm() {
  const form = document.querySelector("#expenseForm");
  if (!form) return;

  showSubmitOverlay({ status: "Создание СЗ..." });

  const fd = new FormData(form);
  const values = {};
  values.files = [];
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) {
      if (k === "files" && v.size > 0) values.files.push(v);
    } else {
      values[k] = v;
    }
  }

  const payload = buildPayload(values);
  const targetIblockId = findTargetIblockIdByDC(values.dealerCenterId);

  if (!targetIblockId) {
    alert(
      "Target IBLOCK_ID not found (PROPERTY_715 on selected dealer center). Please choose dealer center.",
    );
    return;
  }

  // Load FIELD_ID map for the selected list
  let fieldMap = {};
  try {
    fieldMap = await getFieldMap(targetIblockId);
    // console.log("Field map (CODE -> FIELD_ID):", fieldMap);
  } catch (e) {
    console.warn(
      "lists.field.get failed, field map is empty:",
      e?.message || e,
    );
  }

  // console.log("FORM DATA:", values);
  // console.log("BP payload:", payload, "targetIblockId:", targetIblockId);

  // Convert payload to FIELD_ID keys
  const payloadByFieldId = {};
  Object.entries(payload).forEach(([code, val]) => {
    const fieldId =
      fieldMap[code] ||
      fieldMap[code.toUpperCase()] ||
      fieldMap[code.toLowerCase()] ||
      code;
    payloadByFieldId[fieldId] = val;
  });

  // Files (PROPERTY_XXX type F) as fileData if provided
  const fileFieldId =
    fieldMap[bizopsList.files] ||
    fieldMap[bizopsList.files?.toUpperCase()] ||
    fieldMap[bizopsList.files?.toLowerCase()];

  if (fileFieldId && values.files?.length) {
    const uploads = [];
    for (const file of values.files) {
      uploads.push(await fileToBitrix(file));
    }
    // Assuming field is multiple; if single, set uploads[0]
    payloadByFieldId[fileFieldId] = uploads;
    // console.log("fileFieldId:", fileFieldId);
    // console.log("file payload:", payloadByFieldId[fileFieldId]);
  } else {
    // console.log("No files attached or file field ID not found, skipping files.");
  }

  try {
    const res = await bx24Call("lists.element.add", {
      IBLOCK_TYPE_ID: REF.DC.IBLOCK_TYPE_ID,
      IBLOCK_ID: targetIblockId,
      ELEMENT_CODE: `req_${Date.now()}`,
      FIELDS: payloadByFieldId,
    });

    const data = typeof res?.data === "function" ? res.data() : res;
    const elementId = res.data();
    const protoLink = data
      ? `https://carservice.bitrix24.kz/bizproc/processes/${targetIblockId}/element/0/${elementId}/`
      : "";

    const statusText = data ? `СЗ создана (ID: ${data})` : "СЗ создана";

    showSubmitOverlay({
      status: statusText,
      linkHref: protoLink,
      linkLabel: "Протокол",
    });

    form.reset();
    const fileInput = document.querySelector("#files");
    if (fileInput) {
      fileInput.value = "";
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (e) {
    console.error("Send error:", e);
    alert(`Send error: ${e?.message || e}`);
    hideSubmitOverlay();
  }
}
