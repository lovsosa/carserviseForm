import { SETTINGS } from "./refs.js";
import { setupSelectSearch } from "./select-search.js";
import {
  loadUsersToInitiator,
  loadDCAndPDC,
  loadArticlesAndSubarticles,
  loadPaymentSelects,
  loadCurrencies,
} from "./loaders.js";
import { setupFilePicker } from "./upload.js";
import { submitForm } from "./submit.js";
import { showPagePreloader, hidePagePreloader } from "./utils.js";

function disableAutocomplete() {
  const form = document.querySelector("#expenseForm");
  if (!form) return;
  form.setAttribute("autocomplete", "off");
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.setAttribute("autocomplete", "off");
  });
}

function setupSubmit() {
  const form = document.querySelector("#expenseForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitForm();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  BX24.init(async () => {
    showPagePreloader();
    try {
    disableAutocomplete();

    if (SETTINGS.ENABLE_SELECT_SEARCH) {
      setupSelectSearch();
    }

    await Promise.all([loadUsersToInitiator(), loadCurrencies()]);

    await loadDCAndPDC();
    await loadArticlesAndSubarticles();
    await loadPaymentSelects();

    setupFilePicker();
    setupSubmit();
    console.log("Готово.");
    } finally {
      hidePagePreloader();
    }
  });
});
