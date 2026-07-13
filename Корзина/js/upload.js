export function setupFilePicker() {
  const wrapper = document.querySelector(".input-file");
  const input = wrapper?.querySelector('input[type="file"]');
  const text = wrapper?.querySelector(".input-file-text");
  if (!wrapper || !input || !text) return;

  const placeholder = text.dataset.placeholder || "Файлы не выбраны";

let clearBtn = wrapper.querySelector(".input-file-clear");
if (!clearBtn) {
  clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "input-file-clear";
  clearBtn.setAttribute("aria-label", "Очистить файлы");
  clearBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M4.11 2.697L2.698 4.11 6.586 8l-3.89 3.89 1.415 1.413L8 9.414l3.89 3.89 1.413-1.415L9.414 8l3.89-3.89-1.415-1.413L8 6.586l-3.89-3.89z" fill="#000"></path>
</svg>`;

  const chooseBtn = wrapper.querySelector(".input-file-btn");
  if (chooseBtn) chooseBtn.insertAdjacentElement("beforebegin", clearBtn);
  else wrapper.appendChild(clearBtn);
}
  let list = wrapper.querySelector(".input-file-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "input-file-list";
    wrapper.insertAdjacentElement("afterend", list);
  }

  let selected = [];

  const fileKey = (f) => `${f.name}__${f.size}__${f.lastModified}`;

  function syncToInput() {
    const dt = new DataTransfer();
    selected.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  }

  function updateText() {
    if (!selected.length) {
      text.textContent = placeholder;
      return;
    }
    if (selected.length === 1) {
      text.textContent = selected[0].name;
      return;
    }
    const visible = selected.slice(0, 2).map((f) => f.name).join(", ");
    const extra = selected.length - 2;
    text.textContent = extra > 0 ? `${visible} + еще ${extra}` : visible;
  }

  function renderList() {
    if (!selected.length) {
      list.innerHTML = "";
      list.style.display = "none";
      clearBtn.style.display = "none";
      return;
    }

    list.style.display = "";
    clearBtn.style.display = "";

    list.innerHTML = selected
      .map(
        (f, i) => `
        <div class="input-file-item" data-index="${i}">
          <span class="input-file-name">${escapeHtml(f.name)}</span>
          <button type="button" class="input-file-remove" aria-label="Удалить файл">×</button>
        </div>
      `
      )
      .join("");

    list.querySelectorAll(".input-file-item").forEach((row) => {
      const idx = Number(row.dataset.index);
      row.querySelector(".input-file-remove")?.addEventListener("click", () => {
        selected.splice(idx, 1);
        syncToInput();
        updateText();
        renderList();
      });
    });
  }

  function renderAll() {
    updateText();
    renderList();
  }

  input.addEventListener("change", () => {
    const incoming = Array.from(input.files || []);
    if (!incoming.length) return;

    const existing = new Set(selected.map(fileKey));
    for (const f of incoming) {
      const k = fileKey(f);
      if (!existing.has(k)) {
        selected.push(f);
        existing.add(k);
      }
    }

    input.value = "";

    syncToInput();
    renderAll();
  });

  clearBtn.addEventListener("click", () => {
    selected = [];
    input.value = "";
    syncToInput();
    renderAll();
  });

  renderAll();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
