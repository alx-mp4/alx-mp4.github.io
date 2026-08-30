/* ============================================================
   4ukai — WoW TBC Classic setup page
   Depends on js/data.js, which defines `importsData`.
   ============================================================ */

(() => {
  "use strict";

  const SEARCHABLE_BODY = 2000;     // don't index 26 KB of base64 gibberish

  const CATEGORIES = [
    { id: "all", label: "Everything" },
    { id: "weakauras", label: "WeakAuras" },
    { id: "profiles", label: "Addons" },
    { id: "macros", label: "Macros" },
    { id: "commands", label: "Commands" },
    { id: "assets", label: "Assets" }
  ];

  /* The class list is the single source of colour on this page. A class name
     in data.js resolves to its CSS variable here; nothing else gets a colour.
     Adding a class means adding one line here and one --class-* in styles.css. */
  const CLASSES = [
    "Death Knight", "Druid", "Hunter", "Mage", "Paladin",
    "Priest", "Rogue", "Shaman", "Warlock", "Warrior"
  ];

  const classVar = (name) => `var(--class-${name.toLowerCase().replace(/[^a-z]+/g, "-")})`;
  const roleVar = (name) => `var(--role-${name.toLowerCase()})`;

  /* Roles stay neutral and are read from their label. No glyphs: the
     crossed-swords and shield code points are missing from Roboto Mono
     and fall back to tofu on Windows. */
  const ROLE_ORDER = ["Tank", "Healer", "DPS"];

  // Short code -> full instance name. Add new raids here only.
  const RAIDS = {
    KARA: "Karazhan",
    GL: "Gruul's Lair",
    MAG: "Magtheridon's Lair",
    SSC: "Serpentshrine Cavern",
    TK: "Tempest Keep",
    HYJAL: "Hyjal Summit",
    BT: "Black Temple",
    ZA: "Zul'Aman",
    SWP: "Sunwell Plateau"
  };

  /* ---------- storage (degrades to memory if blocked) ---------- */

  const store = (() => {
    const memory = new Map();
    let ok = true;
    try {
      const probe = "__4ukai__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
    } catch {
      ok = false;
    }
    return {
      get(key, fallback) {
        try {
          const raw = ok ? localStorage.getItem(key) : memory.get(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        const raw = JSON.stringify(value);
        try {
          if (ok) localStorage.setItem(key, raw);
          else memory.set(key, raw);
        } catch {
          memory.set(key, raw);
        }
      }
    };
  })();

  /* ---------- data prep ---------- */

  const PLACEHOLDER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

  const entries = importsData.map((raw, i) => {
    const text = raw.importText || "";
    const entry = {
      ...raw,
      id: slug(raw.category, raw.title, i),
      text,
      lines: text ? text.split("\n").length : 0,
      isAsset: Boolean(raw.file),
      roles: raw.roles || [],
      raidName: raw.raid ? RAIDS[raw.raid] || raw.raid : "",
      parts: splitPlaceholders(raw.category, text)
    };
    entry.hasPlaceholders = entry.parts.some((p) => p.token);

    // Filter keys: "facet:value". One flat set keeps filtering and deep
    // links simple no matter how many facets an entry carries.
    entry.keys = [];
    if (raw.class) entry.keys.push(`class:${raw.class}`);
    [...entry.roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)).forEach((r) => entry.keys.push(`role:${r}`));
    if (raw.raid) entry.keys.push(`raid:${raw.raid}`);
    if (raw.core) entry.keys.push("core:1");

    entry.haystack = [
      raw.title,
      raw.class,
      entry.roles.join(" "),
      raw.raid,
      entry.raidName,
      raw.addon,
      raw.version,
      raw.boss,
      raw.note,
      raw.core ? "core" : "",
      raw.description,
      labelFor(raw.category),
      text.length <= SEARCHABLE_BODY ? text : ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return entry;
  });

  // Human label for a filter key
  function keyLabel(key) {
    const [facet, value] = splitKey(key);
    if (facet === "core") return "Core";
    if (facet === "raid") return value;
    return value;
  }

  function splitKey(key) {
    const at = key.indexOf(":");
    return [key.slice(0, at), key.slice(at + 1)];
  }

  function slug(category, title, i) {
    return (
      `${category}-${title}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `entry-${i}`
    );
  }

  function labelFor(id) {
    return CATEGORIES.find((c) => c.id === id)?.label || id;
  }

  // Turn ALL_CAPS_TOKENS into editable slots, but only in short, human-written
  // text — never inside an encoded WeakAura or Plater blob.
  function splitPlaceholders(category, text) {
    if (!text || text.length > 600) return [{ value: text }];
    if (category !== "macros" && category !== "commands") return [{ value: text }];

    const parts = [];
    let last = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (match.index > last) parts.push({ value: text.slice(last, match.index) });
      parts.push({ token: match[0] });
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push({ value: text.slice(last) });
    return parts.length ? parts : [{ value: text }];
  }

  /* ---------- state ---------- */

  const favourites = new Set(store.get("4ukai:favourites", []));
  const fills = store.get("4ukai:fills", {}); // remembered item names per token

  const state = {
    query: "",
    category: "all",
    keys: new Set(),
    savedOnly: false,
    focusId: ""
  };

  const el = {
    search: document.getElementById("searchInput"),
    clear: document.getElementById("clearSearch"),
    tabs: document.getElementById("tabs"),
    chips: document.getElementById("chips"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("emptyState"),
    emptyHint: document.getElementById("emptyHint"),
    resetAll: document.getElementById("resetAll"),
    results: document.getElementById("resultsLine"),
    toasts: document.getElementById("toastDock"),
    toTop: document.getElementById("toTop")
  };

  /* ---------- filtering ---------- */

  function terms() {
    return state.query.split(/\s+/).filter(Boolean);
  }

  function matchesQuery(entry) {
    const t = terms();
    return !t.length || t.every((term) => entry.haystack.includes(term));
  }

  function matchesFilters(entry) {
    if (state.savedOnly && !favourites.has(entry.id)) return false;

    // Selected keys are grouped by facet: an entry must satisfy every facet
    // that has a selection, matching any one value within it.
    const wanted = new Map();
    state.keys.forEach((key) => {
      const [facet] = splitKey(key);
      if (!wanted.has(facet)) wanted.set(facet, []);
      wanted.get(facet).push(key);
    });
    for (const keys of wanted.values()) {
      if (!keys.some((k) => entry.keys.includes(k))) return false;
    }
    return matchesQuery(entry);
  }

  function visible() {
    return entries.filter((e) => matchesFilters(e) && (state.category === "all" || e.category === state.category));
  }

  /* ---------- chrome ---------- */

  function renderTabs() {
    const pool = entries.filter(matchesFilters);
    el.tabs.innerHTML = CATEGORIES.map((cat) => {
      const n = cat.id === "all" ? pool.length : pool.filter((e) => e.category === cat.id).length;
      const selected = state.category === cat.id;
      return `<button class="tab${n ? "" : " is-empty"}" type="button" role="tab"
                aria-selected="${selected}" data-cat="${cat.id}">
                ${cat.label}<span class="count">${n}</span>
              </button>`;
    }).join("");
  }

  const FACETS = [
    { id: "class", label: "Class" },
    { id: "role", label: "Role" },
    { id: "raid", label: "Raid" }
  ];

  // Colour comes from the facet, never from the entry — and only class
  // and Core get one. Everything else is neutral by design.
  function keyColour(key) {
    const [facet, value] = splitKey(key);
    if (facet === "class") return classVar(value);
    if (facet === "role") return roleVar(value);
    if (facet === "core") return "var(--tag-core)";
    return "var(--line-strong)";
  }

  function renderChips() {
    const scope = entries.filter((e) => state.category === "all" || e.category === state.category);

    const counts = new Map();
    scope.forEach((e) => e.keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));

    const chip = (key, label, n, colour) => {
      // Facets that carry a colour also carry a dot, so the bar reads the
      // same way the cards do.
      const coloured = ["class", "role", "core"].includes(splitKey(key)[0]);
      return `<button class="chip${coloured ? " chip-dot" : ""}" type="button"
         data-key="${escapeAttr(key)}" aria-pressed="${state.keys.has(key)}"
         style="--chip: ${colour}">${escapeHtml(label)}<span class="n">${n}</span></button>`;
    };

    let html = "";

    const savedCount = entries.filter((e) => favourites.has(e.id)).length;
    const coreCount = counts.get("core:1") || 0;
    html += `<span class="chip-group"><span class="chips-label">Show</span>`;
    html += `<button class="chip" type="button" data-saved="1" aria-pressed="${state.savedOnly}"
               style="--chip: var(--warn)">&#9733; Saved<span class="n">${savedCount}</span></button>`;
    if (coreCount) html += chip("core:1", "Core", coreCount, "var(--tag-core)");
    html += `</span>`;

    FACETS.forEach((facet) => {
      const keys = [...counts.keys()].filter((k) => splitKey(k)[0] === facet.id);
      if (!keys.length) return;
      keys.sort((a, b) => counts.get(b) - counts.get(a) || keyLabel(a).localeCompare(keyLabel(b)));
      html += `<span class="chip-group"><span class="chips-label">${facet.label}</span>`;
      html += keys.map((k) => chip(k, keyLabel(k), counts.get(k), keyColour(k))).join("");
      html += `</span>`;
    });

    if (state.keys.size || state.savedOnly || state.query) {
      html += `<button class="chip chip-reset" type="button" data-reset="1">Clear all</button>`;
    }
    el.chips.innerHTML = html;
  }

  function renderResults(list) {
    const bits = [`<span><b>${list.length}</b> ${list.length === 1 ? "result" : "results"}`];
    if (state.category !== "all") bits.push(` in ${labelFor(state.category)}`);
    if (state.query) bits.push(` for &ldquo;${escapeHtml(state.query)}&rdquo;`);
    bits.push("</span>");
    el.results.innerHTML = bits.join("");
  }

  /* ---------- cards ---------- */

  function render() {
    const list = visible();

    renderTabs();
    renderChips();
    renderResults(list);

    el.empty.classList.toggle("hidden", list.length > 0);
    if (!state.query) {
      el.emptyHint.textContent = "Clear the filters to see everything.";
    } else if (state.category === "all") {
      el.emptyHint.textContent = `No import matches "${state.query}". Try a shorter or different term.`;
    } else {
      const elsewhere = entries.filter((e) => matchesQuery(e)).length;
      el.emptyHint.textContent = elsewhere
        ? `No match in ${labelFor(state.category).toLowerCase()}, but "${state.query}" turns up ${elsewhere} elsewhere. Try Everything.`
        : `No import matches "${state.query}". Try a shorter or different term.`;
    }

    const frag = document.createDocumentFragment();
    list.forEach((entry, i) => frag.appendChild(buildCard(entry, i)));
    el.grid.replaceChildren(frag);

    document.body.classList.toggle("is-searching", Boolean(state.query));

    if (state.focusId) {
      const target = el.grid.querySelector(`[data-id="${CSS.escape(state.focusId)}"]`);
      if (target) target.scrollIntoView({ block: "center" });
      state.focusId = "";
    }
  }

  function buildCard(entry, index) {
    const card = element("article", "card");
    card.dataset.id = entry.id;
    card.dataset.cat = entry.category;
    card.style.setProperty("--d", `${Math.min(index, 14) * 22}ms`);
    // Class is the only thing that tints a card.
    if (entry.class) card.style.setProperty("--tag", classVar(entry.class));

    const body = element("div", "card-body");
    card.appendChild(body);

    /* head */
    const head = element("div", "card-head");
    const title = element("h2", "card-title");
    title.innerHTML = highlight(entry.title, terms());
    head.appendChild(title);

    const headActions = element("div", "head-actions");
    const star = element("button", "icon-btn");
    star.type = "button";
    star.dataset.fav = entry.id;
    star.title = "Save to your list";
    star.setAttribute("aria-label", `Save ${entry.title}`);
    setStar(star, favourites.has(entry.id));
    headActions.appendChild(star);

    const link = element("button", "icon-btn");
    link.type = "button";
    link.dataset.link = entry.id;
    link.title = "Copy a link to this";
    link.setAttribute("aria-label", `Copy a link to ${entry.title}`);
    link.textContent = "\u{1F517}";
    headActions.appendChild(link);
    head.appendChild(headActions);
    body.appendChild(head);

    /* Meta row. Colour is reserved for class; role is told apart by its
       glyph, raid and version stay neutral. */
    const meta = element("div", "meta");
    const bits = [];

    if (entry.core) bits.push(`<span class="t-core">Core</span>`);
    if (entry.class)
      bits.push(`<span class="t-class" style="--tag: ${classVar(entry.class)}">${escapeHtml(entry.class)}</span>`);
    [...entry.roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)).forEach((r) =>
      bits.push(`<span class="t-role" style="--tag: ${roleVar(r)}">${escapeHtml(r)}</span>`)
    );
    if (entry.raid)
      bits.push(`<span class="t-raid" title="${escapeAttr(entry.raidName)}">${escapeHtml(entry.raid)}</span>`);

    const plain = [labelFor(entry.category)];
    if (entry.addon) plain.push(entry.addon);
    if (entry.boss) plain.push(entry.boss);
    if (entry.isAsset) plain.push(`${entry.file.split(".").pop()} download`);
    bits.push(`<span class="plain">${escapeHtml(plain.join(" \u00b7 "))}</span>`);

    if (entry.version)
      bits.push(`<span class="t-version">v${escapeHtml(entry.version)}</span>`);

    meta.innerHTML = bits.join("");
    body.appendChild(meta);

    if (entry.isAsset) {
      buildAssetBody(entry, body);
    } else {
      buildImportBody(entry, body);
    }

    return card;
  }

  function buildAssetBody(entry, body) {
    if (entry.description) {
      const note = element("p", "asset-note");
      note.textContent = entry.description;
      body.appendChild(note);
    }
    const actions = element("div", "actions");
    const download = element("a", "btn btn-primary");
    download.href = entry.file;
    download.setAttribute("download", entry.file.split("/").pop());
    download.textContent = `Download ${entry.file.split("/").pop()}`;
    actions.appendChild(download);
    body.appendChild(actions);
  }

  function buildImportBody(entry, body) {
    // Long strings simply scroll inside the code box — no expand button.
    const wrap = element("div", "code-wrap");
    const pre = element("pre", "code");
    const inputs = [];

    if (entry.hasPlaceholders) {
      entry.parts.forEach((part) => {
        if (part.value != null) {
          pre.appendChild(document.createTextNode(part.value));
          return;
        }
        const input = element("input", "ph");
        input.type = "text";
        input.value = fills[part.token] || "";
        input.placeholder = part.token;
        input.dataset.token = part.token;
        input.setAttribute("aria-label", `Value for ${part.token}`);
        input.spellcheck = false;
        sizeInput(input);
        inputs.push(input);
        pre.appendChild(input);
      });
    } else {
      pre.textContent = entry.text;
    }

    wrap.appendChild(pre);
    body.appendChild(wrap);

    if (entry.hasPlaceholders) {
      const note = element("p", "ph-note");
      const n = inputs.length;
      note.innerHTML =
        n === 1
          ? `Fill in <b>1</b> name above &mdash; it goes into the copy.`
          : `Fill in <b>${n}</b> names above &mdash; they go into the copy.`;
      body.appendChild(note);
    }

    const actions = element("div", "actions");    const copy = element("button", "btn btn-primary");
    copy.type = "button";
    copy.dataset.copy = entry.id;
    copy.textContent = "Copy";
    actions.appendChild(copy);

    body.appendChild(actions);

    // Live wiring for placeholder edits
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        fills[input.dataset.token] = input.value;
        store.set("4ukai:fills", fills);
        sizeInput(input);
      });
    });
  }

  function sizeInput(input) {
    const width = Math.max((input.value || input.placeholder).length, 4);
    input.style.width = `${width + 1}ch`;
  }

  // The text that actually reaches the clipboard, with any filled-in names applied.
  function resolve(entry, scope) {
    if (!entry.hasPlaceholders) return entry.text;
    const values = new Map();
    scope.querySelectorAll(".ph").forEach((input) => {
      if (input.value.trim()) values.set(input.dataset.token, input.value.trim());
    });
    return entry.parts.map((p) => (p.value != null ? p.value : values.get(p.token) || p.token)).join("");
  }

  /* ---------- events ---------- */

  el.search.addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
    syncHash();
  });

  el.clear.addEventListener("click", () => {
    el.search.value = "";
    state.query = "";
    el.search.focus();
    render();
    syncHash();
  });

  el.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-cat]");
    if (!tab) return;
    state.category = tab.dataset.cat;
    render();
    syncHash();
  });

  el.chips.addEventListener("click", (e) => {
    const chip = e.target.closest("button");
    if (!chip) return;

    if (chip.dataset.reset) {
      state.keys.clear();
      state.savedOnly = false;
      state.query = "";
      el.search.value = "";
    } else if (chip.dataset.saved) {
      state.savedOnly = !state.savedOnly;
    } else if (chip.dataset.key) {
      const key = chip.dataset.key;
      state.keys.has(key) ? state.keys.delete(key) : state.keys.add(key);
    }
    render();
    syncHash();
  });

  el.resetAll.addEventListener("click", () => {
    state.keys.clear();
    state.savedOnly = false;
    state.query = "";
    state.category = "all";
    el.search.value = "";
    render();
    syncHash();
  });

  el.grid.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      const entry = entries.find((x) => x.id === copyBtn.dataset.copy);
      if (!entry) return;
      const card = copyBtn.closest(".card");
      const text = resolve(entry, card);
      const done = await copyToClipboard(text);
      if (done) {
        flashButton(copyBtn);
        toast(`${entry.title} copied`, `${text.length} characters`);
      } else {
        toast("Couldn't reach the clipboard", "Select the text and copy it manually.");
      }
      return;
    }

    const favBtn = e.target.closest("[data-fav]");
    if (favBtn) {
      const id = favBtn.dataset.fav;
      favourites.has(id) ? favourites.delete(id) : favourites.add(id);
      store.set("4ukai:favourites", [...favourites]);
      setStar(favBtn, favourites.has(id));
      renderChips();
      if (state.savedOnly) render();
      return;
    }

    const linkBtn = e.target.closest("[data-link]");
    if (linkBtn) {
      const url = `${location.origin}${location.pathname}#id=${encodeURIComponent(linkBtn.dataset.link)}`;
      const done = await copyToClipboard(url);
      toast(done ? "Link copied" : "Couldn't reach the clipboard", done ? url : "");
    }
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");

    if (!typing && e.key === "/") {
      e.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      el.search.focus();
      el.search.select();
      return;
    }
    if (e.key === "Escape" && document.activeElement === el.search) {
      el.search.value = "";
      state.query = "";
      el.search.blur();
      render();
      syncHash();
    }
  });

  el.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  window.addEventListener(
    "scroll",
    () => el.toTop.classList.toggle("is-visible", window.scrollY > 700),
    { passive: true }
  );

  window.addEventListener("hashchange", () => {
    readHash();
    render();
  });

  /* ---------- clipboard, toasts, stars ---------- */

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
        document.body.appendChild(helper);
        helper.select();
        const ok = document.execCommand("copy");
        helper.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function flashButton(btn) {
    const original = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("is-copied");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("is-copied");
    }, 1400);
  }

  function toast(message, detail) {
    const node = element("div", "toast");
    node.innerHTML = `<span class="tick" aria-hidden="true">&#10003;</span>
      <span><b>${escapeHtml(message)}</b>${detail ? `<br><span class="mono" style="font-size:.76rem;opacity:.7">${escapeHtml(detail)}</span>` : ""}</span>`;
    el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add("is-out");
      setTimeout(() => node.remove(), 240);
    }, 2200);
  }

  function setStar(btn, on) {
    btn.textContent = on ? "\u2605" : "\u2606";
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  /* ---------- deep links ---------- */

  let writingHash = false;

  function syncHash() {
    const params = new URLSearchParams();
    if (state.category !== "all") params.set("cat", state.category);
    if (state.query) params.set("q", state.query);
    if (state.keys.size) params.set("f", [...state.keys].join("~"));
    if (state.savedOnly) params.set("saved", "1");
    const hash = params.toString();
    writingHash = true;
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
    writingHash = false;
  }

  function readHash() {
    if (writingHash) return;
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));

    const id = params.get("id");
    if (id) {
      const entry = entries.find((x) => x.id === id);
      if (entry) {
        state.category = entry.category;
        state.query = "";
        state.keys.clear();
        state.savedOnly = false;
        state.focusId = id;
        el.search.value = "";
        return;
      }
    }

    state.category = CATEGORIES.some((c) => c.id === params.get("cat")) ? params.get("cat") : "all";
    state.query = (params.get("q") || "").toLowerCase();
    state.keys = new Set((params.get("f") || "").split("~").filter(Boolean));
    state.savedOnly = params.get("saved") === "1";
    el.search.value = state.query;
  }

  /* ---------- ambient motes ---------- */

  const motes = (() => {
    const canvas = document.getElementById("motes");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canvas || reduced) return { recolour() {} };

    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let colour = "157, 123, 255";
    const dust = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.floor(innerWidth * dpr);
      h = canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      dust.length = 0;
      for (let i = 0; i < 34; i += 1) {
        dust.push({
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          r: 0.5 + Math.random() * 1.4,
          speed: 0.08 + Math.random() * 0.26,
          drift: Math.random() * Math.PI * 2,
          alpha: 0.08 + Math.random() * 0.32
        });
      }
    }

    function recolour() {
      const hex = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (m) colour = `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      dust.forEach((d) => {
        d.y -= d.speed;
        d.drift += 0.004;
        const x = d.x + Math.sin(d.drift) * 14;
        if (d.y < -12) {
          d.y = innerHeight + 12;
          d.x = Math.random() * innerWidth;
        }
        ctx.beginPath();
        ctx.arc(x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colour}, ${d.alpha})`;
        ctx.fill();
      });
      requestAnimationFrame(frame);
    }

    resize();
    seed();
    recolour();
    requestAnimationFrame(frame);
    window.addEventListener("resize", () => {
      resize();
      seed();
    });

    return { recolour };
  })();

  /* ---------- helpers ---------- */

  function element(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function highlight(text, tokens) {
    const safe = escapeHtml(text);
    if (!tokens.length) return safe;
    const pattern = tokens
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .filter(Boolean)
      .join("|");
    if (!pattern) return safe;
    return safe.replace(new RegExp(`(${pattern})`, "gi"), "<mark>$1</mark>");
  }

  /* ---------- boot ---------- */

  readHash();
  render();
})();
