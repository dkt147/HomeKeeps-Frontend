/* ==========================================================================
   HomeKeep Console — generic admin CRUD page renderer
   Powers every simple "table of rows, with create/edit/delete" admin screen
   (manufacturers, service providers, whatsapp templates, automations,
   warranty plans, eligibility rules, lead sources) so each of those pages
   is just a small config object instead of repeated boilerplate.
   Requires js/api.js to be loaded first.
   ========================================================================== */

function fieldFirst(obj, keys, fallback) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

function getItemId(item, idField) {
  return fieldFirst(item, [idField || "id", "id", "_id"], "");
}

function formFieldHtml(field, value) {
  const val = value === undefined || value === null ? "" : value;
  const id = "f_" + field.key;

  if (field.type === "checkbox") {
    return `
      <label style="flex-direction:row;align-items:center;gap:8px;margin-bottom:14px">
        <input id="${id}" type="checkbox" style="width:auto" ${val ? "checked" : ""}> ${escapeHtml(field.label)}
        ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ""}
      </label>`;
  }

  if (field.type === "select") {
    const opts = (field.options || []).map(o =>
      `<option value="${escapeHtml(o.value)}" ${String(val) === String(o.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
    return `
      <label>${escapeHtml(field.label)}
        <select id="${id}">${opts}</select>
        ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ""}
      </label>`;
  }

  if (field.type === "textarea") {
    return `
      <label>${escapeHtml(field.label)}
        <textarea id="${id}" rows="${field.rows || 4}" placeholder="${escapeHtml(field.placeholder || "")}" style="font-family:ui-monospace,monospace;font-size:12.5px">${escapeHtml(typeof val === "object" ? JSON.stringify(val, null, 2) : val)}</textarea>
        ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ""}
      </label>`;
  }

  return `
    <label>${escapeHtml(field.label)}
      <input id="${id}" type="${field.type || "text"}" value="${escapeHtml(val)}" placeholder="${escapeHtml(field.placeholder || "")}">
      ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ""}
    </label>`;
}

function readFormValue(field) {
  const el = document.getElementById("f_" + field.key);
  if (!el) return undefined;

  if (field.type === "checkbox") return el.checked;

  if (field.type === "number") return el.value === "" ? null : Number(el.value);

  if (field.type === "list") return el.value.split(",").map(s => s.trim()).filter(Boolean);

  if (field.type === "textarea" && field.json) {
    if (!el.value.trim()) return null;
    try { return JSON.parse(el.value); }
    catch (e) { throw new Error(field.label + " must be valid JSON."); }
  }

  return el.value;
}

async function renderCrudPage(config) {
  renderSidebar(config.navKey);
  try {
    await loadStaffContext();
  } catch (error) {
    showBanner("pageError", error.message || "Unable to load permissions.");
    return;
  }

  const canCreate = !config.createPermission || hasPermission(config.createPermission);
  const canUpdate = !config.updatePermission || hasPermission(config.updatePermission);
  const canDelete = config.deletePermission ? hasPermission(config.deletePermission) : config.deletable !== false;
  const canToggle = config.toggleField && canUpdate;
  const state = { items: [], editingId: null };

  document.getElementById("pageEyebrow").textContent = config.eyebrow;
  document.getElementById("pageTitle").textContent = config.title;
  document.getElementById("pageSubtitle").textContent = config.subtitle || "";
  const newButton = document.getElementById("newBtn");
  newButton.textContent = config.createLabel || ("+ New " + config.title.toLowerCase());
  newButton.style.display = canCreate ? "" : "none";

  const theadRow = document.getElementById("theadRow");
  theadRow.innerHTML = config.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("") + "<th></th>";

  function openForm(item) {
    state.editingId = item ? getItemId(item, config.idField) : null;
    document.getElementById("formTitle").textContent = item ? "Edit " + config.title.toLowerCase().replace(/s$/, "") : (config.createLabel || "New " + config.title.toLowerCase());
    document.getElementById("formFields").innerHTML = config.fields.map(f => formFieldHtml(f, item ? fieldFirst(item, [f.key], f.type === "checkbox" ? false : "") : (f.default ?? ""))).join("");
    document.getElementById("formPanel").style.display = "block";
    document.getElementById("formPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeForm() {
    document.getElementById("formPanel").style.display = "none";
    state.editingId = null;
  }

  document.getElementById("newBtn").addEventListener("click", () => openForm(null));
  document.getElementById("cancelFormBtn").addEventListener("click", closeForm);

  document.getElementById("saveFormBtn").addEventListener("click", async () => {
    let payload = {};
    try {
      config.fields.forEach(f => {
        const v = readFormValue(f);
        if (v !== undefined) payload[f.key] = v;
      });
    } catch (e) {
      toast(e.message, "err");
      return;
    }

    if (config.beforeSave) payload = config.beforeSave(payload) || payload;

    try {
      if (state.editingId) {
        if (!canUpdate) { throw new Error("You do not have permission to update this resource."); }
        await authFetch(config.listPath + "/" + encodeURIComponent(state.editingId), { method: "PATCH", body: payload });
        toast(config.title + " updated.");
      } else {
        if (!canCreate) { throw new Error("You do not have permission to create this resource."); }
        await authFetch(config.listPath, { method: "POST", body: payload });
        toast(config.title + " created.");
      }
      closeForm();
      load();
    } catch (error) {
      toast(error.message || "Could not save.", "err");
    }
  });

  async function toggleField(id, field, newVal) {
    try {
      await authFetch(config.listPath + "/" + encodeURIComponent(id), { method: "PATCH", body: { [field]: newVal } });
      toast("Updated.");
      load();
    } catch (error) {
      toast(error.message || "Could not update.", "err");
      load();
    }
  }

  function rowHtml(item) {
    const id = getItemId(item, config.idField);
    const cells = config.columns.map(c => `<td>${c.render(item)}</td>`).join("");
    let toggleCell = "";
    if (config.toggleField && canToggle) {
      const on = item[config.toggleField] !== false;
      toggleCell = `<button class="badge ${on ? "b-success" : "b-muted"}" data-toggle="${escapeHtml(id)}" style="border:none;cursor:pointer">${on ? "active" : "inactive"}</button>`;
    }
    return `
      <tr data-id="${escapeHtml(id)}">
        ${cells}
        <td style="display:flex;gap:6px;align-items:center">
          ${toggleCell}
          ${canUpdate ? `<button class="btn ghost small" data-edit="${escapeHtml(id)}">Edit</button>` : ""}
          ${canDelete ? `<button class="btn ghost small" data-del="${escapeHtml(id)}" style="color:var(--danger)">Delete</button>` : ""}
        </td>
      </tr>`;
  }

  async function load() {
    hideBanner("pageError");
    const tbody = document.getElementById("rows");
    const empty = document.getElementById("emptyState");
    try {
      const data = await authFetch(config.listPath + (config.listQuery || ""), { method: "GET" });
      const items = Array.isArray(data) ? data : (data.items || data.results || data.data || []);
      state.items = items;

      document.getElementById("rowCount").textContent = items.length + " " + (items.length === 1 ? config.title.toLowerCase().replace(/s$/, "") : config.title.toLowerCase());

      if (!items.length) {
        tbody.innerHTML = "";
        empty.style.display = "block";
      } else {
        empty.style.display = "none";
        tbody.innerHTML = items.map(rowHtml).join("");

        tbody.querySelectorAll("[data-edit]").forEach(btn => {
          btn.addEventListener("click", () => {
            const item = items.find(i => String(getItemId(i, config.idField)) === String(btn.dataset.edit));
            openForm(item);
          });
        });

        tbody.querySelectorAll("[data-del]").forEach(btn => {
          btn.addEventListener("click", async () => {
            if (!confirm("Delete this " + config.title.toLowerCase().replace(/s$/, "") + "? This cannot be undone.")) return;
            try {
              await authFetch(config.listPath + "/" + encodeURIComponent(btn.dataset.del), { method: "DELETE" });
              toast(config.title + " deleted.");
              load();
            } catch (error) {
              toast(error.message || "Could not delete.", "err");
            }
          });
        });

        tbody.querySelectorAll("[data-toggle]").forEach(btn => {
          btn.addEventListener("click", () => {
            const item = items.find(i => String(getItemId(i, config.idField)) === String(btn.dataset.toggle));
            const current = item[config.toggleField] !== false;
            toggleField(btn.dataset.toggle, config.toggleField, !current);
          });
        });
      }
    } catch (error) {
      console.error(config.title + " load error:", error);
      tbody.innerHTML = "";
      showBanner("pageError", error.message || ("Unable to load " + config.title.toLowerCase() + "."));
    }
  }

  load();
}
