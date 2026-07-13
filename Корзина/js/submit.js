let isSubmitting = false;

function getResultId(res) {
  if (!res) return null;
  const d1 = typeof res?.data === "function" ? res.data() : res?.data;
  return (
    res?.answer?.result ??
    res?.result ??
    d1?.result ??
    d1 ??
    null
  );
}

export async function submitForm(form) {
  if (!form) {
    console.error("submitForm: form is required");
    return;
  }

  if (isSubmitting) return;
  isSubmitting = true;

  try {
    showSubmitOverlay({ status: "Создание СЗ..." });

    const fd = new FormData(form);
    const values = { files: [] };

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
        "Target IBLOCK_ID not found (PROPERTY_715 on selected dealer center). Please choose dealer center."
      );
      hideSubmitOverlay();
      return;
    }

    // Load FIELD_ID map for the selected list
    let fieldMap = {};
    try {
      fieldMap = await getFieldMap(targetIblockId);
      console.log("Field map (CODE -> FIELD_ID):", fieldMap);
    } catch (e) {
      console.warn("lists.field.get failed, field map is empty:", e?.message || e);
    }

    console.log("FORM DATA:", values);
    console.log("BP payload:", payload, "targetIblockId:", targetIblockId);

    const payloadByFieldId = {};
    Object.entries(payload).forEach(([code, val]) => {
      const fieldId =
        fieldMap[code] ||
        fieldMap[String(code).toUpperCase()] ||
        fieldMap[String(code).toLowerCase()] ||
        code;
      payloadByFieldId[fieldId] = val;
    });
    const fileFieldId =
      fieldMap[bizopsList.files] ||
      fieldMap[String(bizopsList.files).toUpperCase()] ||
      fieldMap[String(bizopsList.files).toLowerCase()];

    if (fileFieldId && values.files?.length) {
      const uploads = [];
      for (const file of values.files) {
        uploads.push(await fileToBitrix(file));
      }
      payloadByFieldId[fileFieldId] = uploads;

      console.log("fileFieldId:", fileFieldId);
      console.log("file payload:", payloadByFieldId[fileFieldId]);
    } else {
      console.log("No files attached or file field ID not found, skipping files.");
    }

    const res = await bx24Call("lists.element.add", {
      IBLOCK_TYPE_ID: REF.DC.IBLOCK_TYPE_ID,
      IBLOCK_ID: targetIblockId,
      ELEMENT_CODE: `req_${Date.now()}`,
      FIELDS: payloadByFieldId,
    });

    const elementId = getResultId(res);

    const protoLink = elementId
      ? `https://carservice.bitrix24.kz/bizproc/processes/${targetIblockId}/element/0/${elementId}/`
      : "";

    const statusText = elementId ? `СЗ создана (ID: ${elementId})` : "СЗ создана";

    showSubmitOverlay({
      status: statusText,
      linkHref: protoLink,
      linkLabel: "Протокол",
    });

    form.reset();

    const fileInput = form.querySelector("#files") || document.querySelector("#files");
    if (fileInput) {
      fileInput.value = "";
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (e) {
    console.error("Send error:", e);
    alert(`Send error: ${e?.message || e}`);
    hideSubmitOverlay();
  } finally {
    isSubmitting = false;
  }
}
