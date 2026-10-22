(function () {
  "use strict";

  var S = window.SignOff;
  var STORAGE_KEY = "signoff:v1";
  // Where signature images are served from once published. Used for copied
  // signatures when the app itself runs locally (http://localhost).
  var PRODUCTION_ASSET_BASE = "https://firegeko.github.io/SignOff/assets/";
  var HEX = /^#[0-9a-f]{6}$/i;

  var DEFAULTS = {
    template: "classic",
    name: "Alex Morgan",
    jobTitle: "Head of Partnerships",
    company: "Northwind Studio",
    phone: "+44 113 496 0000",
    mobile: "",
    email: "alex@northwind.example",
    website: "www.northwind.example",
    address: "",
    logoUrl: "",
    logoWidth: 120,
    social: { linkedin: "linkedin.com/company/northwind" },
    socialText: "",
    socialTextUrl: "",
    badges: [],
    icons: {},
    // theme.primary / accent / solid are only used when id is "custom".
    theme: { id: "navy", primary: "#1b2a4a", accent: "#1f4b99", solid: false },
    colorOverrides: {},
    fonts: { body: "arial", name: "auto", title: "auto", footer: "auto" },
    // Per-part overrides: { role: { letter: px, line: multiple of font size } }.
    spacing: {},
    titleGap: 0,
    badgePosition: null,
    // How colour codes are shown in the editor: "hex" or "rgb". Either can be typed.
    colourFormat: "hex",
    // An imported signature kept as its own style (see js/importer.js).
    custom: null,
    footerText: "",
    footerStyle: "text"
  };

  var state = load();

  /* ---------- Persistence ---------- */

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    try {
      return normalise(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (e) {
      return normalise(null); // storage blocked or corrupt
    }
  }

  // Turns saved settings (from this browser, or from an opened SignOff file,
  // which is untrusted) into a complete, valid state.
  function normalise(saved) {
    var data = clone(DEFAULTS);
    if (!saved || typeof saved !== "object") return data;
    Object.keys(DEFAULTS).forEach(function (k) {
      if (!(k in saved)) return;
      var d = DEFAULTS[k];
      if (d !== null && typeof d !== "object" && typeof saved[k] !== typeof d) return;
      data[k] = saved[k];
    });
    data.social = plainStrings(saved.social);
    data.icons = plainStrings(saved.icons);
    data.badges = (Array.isArray(saved.badges) ? saved.badges : []).filter(Boolean).map(function (b) {
      return { url: String(b.url || ""), alt: String(b.alt || ""), width: parseInt(b.width, 10) || S.badge.default };
    });
    data.theme = Object.assign(clone(DEFAULTS.theme), saved.theme && typeof saved.theme === "object" ? saved.theme : {});
    if (!HEX.test(data.theme.primary)) data.theme.primary = DEFAULTS.theme.primary;
    if (!HEX.test(data.theme.accent)) data.theme.accent = DEFAULTS.theme.accent;
    data.colorOverrides = Object.assign({}, saved.colorOverrides || {});
    data.fonts = Object.assign(clone(DEFAULTS.fonts), saved.fonts || {});
    data.spacing = Object.assign({}, saved.spacing || {});
    data.badgePosition = typeof saved.badgePosition === "number" ? saved.badgePosition : null;
    if (data.colourFormat !== "rgb") data.colourFormat = "hex";
    // Drafts from before themes had one brand colour and one font.
    if (!saved.theme && HEX.test(saved.brandColor || "")) {
      data.theme = { id: "custom", primary: saved.brandColor, accent: saved.brandColor, solid: false };
    }
    if (!saved.fonts && S.fonts[saved.font]) data.fonts.body = saved.font;
    delete data.brandColor;
    delete data.font;
    Object.keys(data.fonts).forEach(function (k) {
      if (!S.fonts[data.fonts[k]] && !(k !== "body" && data.fonts[k] === "auto")) data.fonts[k] = DEFAULTS.fonts[k];
    });
    Object.keys(data.colorOverrides).forEach(function (k) {
      if (!HEX.test(data.colorOverrides[k])) delete data.colorOverrides[k];
    });
    data.custom = normaliseCustom(saved.custom);
    var known = S.templates.some(function (t) { return t.id === data.template; });
    if (!known && !(data.template === "custom" && data.custom)) data.template = DEFAULTS.template;
    return data;
  }

  function plainStrings(obj) {
    var out = {};
    if (obj && typeof obj === "object") {
      Object.keys(obj).forEach(function (k) {
        if (typeof obj[k] === "string") out[k] = obj[k];
      });
    }
    return out;
  }

  // A custom style's HTML is always re-cleaned, wherever it came from.
  function normaliseCustom(c) {
    if (!c || typeof c !== "object" || typeof c.html !== "string") return null;
    var html = S.importer.sanitize(c.html);
    if (!html) return null;
    var images = {};
    if (c.imageEdits && typeof c.imageEdits === "object") {
      Object.keys(c.imageEdits).forEach(function (k) {
        var e = c.imageEdits[k] || {};
        images[k] = { src: String(e.src || ""), alt: String(e.alt || ""), width: parseInt(e.width, 10) || 0 };
      });
    }
    var swaps = {};
    Object.keys(c.colourSwaps || {}).forEach(function (k) {
      if (HEX.test(k) && HEX.test(c.colourSwaps[k])) swaps[k] = c.colourSwaps[k].toLowerCase();
    });
    var fontSwaps = {};
    Object.keys(c.fontSwaps || {}).forEach(function (k) {
      if (S.fonts[c.fontSwaps[k]]) fontSwaps[k] = c.fontSwaps[k];
    });
    return {
      html: html,
      source: String(c.source || "Imported signature").slice(0, 120),
      textEdits: plainStrings(c.textEdits),
      linkEdits: plainStrings(c.linkEdits),
      imageEdits: images,
      colourSwaps: swaps,
      fontSwaps: fontSwaps
    };
  }

  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 250);
  }

  /* ---------- Colours ---------- */

  // Theme colours with the person's own changes on top.
  function colours() {
    var c = Object.assign(S.themeColours(state.theme), state.colorOverrides);
    // Free text matches the contact details until it's given its own colour.
    if (!("freeText" in state.colorOverrides)) c.freeText = c.text;
    return c;
  }

  // What templates receive: the state plus resolved colours for every role.
  function renderData() {
    return Object.assign({}, state, { colors: colours() });
  }

  /* ---------- Rendering ---------- */

  var previewEl = document.getElementById("preview");
  var templateGrid = document.getElementById("templateGrid");

  // Signature images (default icons) live in this site's assets/ folder. Copied
  // signatures need a public https address, so a local copy of the app points
  // them at the published site instead.
  function assetBase(forExport) {
    var local = new URL("assets/", location.href).href;
    if (location.protocol === "https:") return local;
    return forExport ? PRODUCTION_ASSET_BASE : local;
  }

  function isCustom(templateId) {
    return (templateId || state.template) === "custom" && !!state.custom;
  }

  // The HTML people copy: no holding images, public image links only.
  function signatureHtml() {
    if (isCustom()) return S.importer.render(state.custom);
    return S.render(state.template, renderData(), { assetBase: assetBase(true) });
  }

  function previewHtml(templateId) {
    if (isCustom(templateId)) return S.importer.render(state.custom, { preview: true });
    return S.render(templateId || state.template, renderData(), { preview: true, assetBase: assetBase(false) });
  }

  // Plain-text version for the clipboard.
  function signatureText() {
    if (!isCustom()) return S.renderText(state);
    var holder = document.createElement("div");
    holder.innerHTML = signatureHtml();
    return (holder.innerText || holder.textContent).trim();
  }

  // Signatures never re-wrap, so on a narrow screen the preview shrinks the
  // whole thing to fit, the same way phone email apps do.
  function fitPreview() {
    var inner = previewEl.firstElementChild;
    if (!inner) return;
    inner.style.transform = "";
    previewEl.style.height = "";
    var natural = inner.offsetWidth;
    var room = previewEl.clientWidth;
    if (natural > room && room > 0) {
      var scale = room / natural;
      inner.style.transform = "scale(" + scale + ")";
      // The box's height includes its own top padding (box-sizing: border-box).
      var padding = parseFloat(getComputedStyle(previewEl).paddingTop) || 0;
      previewEl.style.height = Math.ceil(inner.offsetHeight * scale + padding) + "px";
    }
    document.getElementById("scaleNote").hidden = !(natural > room && room > 0);
  }

  window.addEventListener("resize", fitPreview);

  // Images finish loading after the preview is drawn and change its size, so
  // re-fit whenever the signature's own size changes.
  var previewWatcher = window.ResizeObserver ? new ResizeObserver(fitPreview) : null;

  function render() {
    previewEl.innerHTML = '<div class="sig-scale">' + previewHtml() + "</div>";
    if (previewWatcher) {
      previewWatcher.disconnect();
      previewWatcher.observe(previewEl.firstElementChild);
    }
    fitPreview();
    document.getElementById("placeholderNote").hidden = !previewEl.querySelector("[data-placeholder]");
    previewEl.classList.toggle("custom-preview", isCustom());
    syncBadgePosition();
    renderThumbs();
    save();
  }

  function buildTemplatePicker() {
    S.templates.forEach(function (t) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "template-card";
      card.setAttribute("role", "radio");
      card.dataset.template = t.id;
      card.innerHTML = '<div class="thumb" aria-hidden="true"><div class="thumb-inner"></div></div>' +
        '<div class="template-meta"><strong></strong><span></span></div>';
      card.querySelector("strong").textContent = t.name;
      card.querySelector(".template-meta span").textContent = t.description;
      card.addEventListener("click", function () { setTemplate(t.id); });
      templateGrid.appendChild(card);
    });
    syncCustomCard();
  }

  // The "Custom" card exists only while there's an imported signature.
  function syncCustomCard() {
    var card = templateGrid.querySelector('[data-template="custom"]');
    if (!state.custom) {
      if (card) card.remove();
      return;
    }
    if (!card) {
      card = document.createElement("button");
      card.type = "button";
      card.className = "template-card";
      card.setAttribute("role", "radio");
      card.dataset.template = "custom";
      card.innerHTML = '<div class="thumb" aria-hidden="true"><div class="thumb-inner"></div></div>' +
        '<div class="template-meta"><strong>Custom</strong><span></span></div>';
      card.addEventListener("click", function () { setTemplate("custom"); });
      templateGrid.appendChild(card);
    }
    card.querySelector(".template-meta span").textContent = "From " + state.custom.source;
  }

  function setTemplate(id) {
    state.template = id;
    buildRoleRows();
    syncTemplateSections();
    if (id === "custom") buildCustomEditor();
    render();
  }

  // Hide editor sections the chosen style doesn't use.
  function syncTemplateSections() {
    var custom = isCustom();
    document.querySelectorAll("[data-builtin]").forEach(function (el) { el.hidden = custom; });
    document.getElementById("customPanel").hidden = !custom;
    if (custom) return;
    var t = S.findTemplate(state.template);
    document.getElementById("iconSection").hidden = !t.icons;
    document.getElementById("imageNote").hidden = !t.noImages;
  }

  function renderThumbs() {
    Array.prototype.forEach.call(templateGrid.children, function (card) {
      card.querySelector(".thumb-inner").innerHTML = previewHtml(card.dataset.template);
      card.setAttribute("aria-checked", String(card.dataset.template === state.template));
      card.tabIndex = card.dataset.template === state.template ? 0 : -1;
    });
  }

  // Arrow keys move between template cards, like a native radio group.
  templateGrid.addEventListener("keydown", function (e) {
    var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    var ids = S.templates.map(function (t) { return t.id; });
    if (state.custom) ids.push("custom");
    var i = (ids.indexOf(state.template) + keys[e.key] + ids.length) % ids.length;
    setTemplate(ids[i]);
    templateGrid.querySelector('[data-template="' + ids[i] + '"]').focus();
  });

  function buildSocialFields() {
    var wrap = document.getElementById("socialFields");
    S.socials.forEach(function (s) {
      var label = document.createElement("label");
      label.textContent = s.label;
      var input = document.createElement("input");
      input.type = "url";
      input.placeholder = "@yourname or a full link";
      input.value = state.social[s.key] || "";
      input.addEventListener("input", function () {
        state.social[s.key] = input.value;
        render();
      });
      label.appendChild(input);
      wrap.appendChild(label);
    });
  }

  /* ---------- Badges ---------- */

  var badgeList = document.getElementById("badgeFields");

  // Rebuilt only when a badge is added or removed, so typing keeps focus.
  function buildBadgeFields() {
    badgeList.innerHTML = "";
    state.badges.forEach(function (badge, i) {
      var row = document.createElement("div");
      row.className = "badge-row";
      row.innerHTML =
        '<div class="badge-row-head"><strong>Badge ' + (i + 1) + '</strong>' +
        '<button type="button" class="link-button remove">Remove</button></div>' +
        '<label>Image link<input type="url" placeholder="https://…/badge.png"></label>' +
        '<label>Description<input type="text" placeholder="e.g. Industry Award 2026"></label>' +
        '<label class="span-2"><span>Size <output></output></span>' +
        '<input type="range" min="' + S.badge.min + '" max="' + S.badge.max + '" step="2"></label>';
      var inputs = row.querySelectorAll("input");
      var out = row.querySelector("output");
      inputs[0].value = badge.url;
      inputs[1].value = badge.alt;
      inputs[2].value = badge.width;
      out.textContent = badge.width + "px";
      inputs[0].addEventListener("input", function () { badge.url = inputs[0].value; render(); });
      inputs[1].addEventListener("input", function () { badge.alt = inputs[1].value; render(); });
      inputs[2].addEventListener("input", function () {
        badge.width = parseInt(inputs[2].value, 10);
        out.textContent = badge.width + "px";
        render();
      });
      row.querySelector(".remove").addEventListener("click", function () {
        state.badges.splice(state.badges.indexOf(badge), 1);
        buildBadgeFields();
        render();
      });
      badgeList.appendChild(row);
    });
  }

  // Badge row position: null means "use the style's default".
  var badgePosInput = document.getElementById("badgePosition");

  function syncBadgePosition() {
    var t = S.findTemplate(state.template);
    var own = typeof state.badgePosition === "number";
    var pos = own ? state.badgePosition : (t.badgePosition || 0);
    var hasBadges = state.badges.length > 0 || !!t.badgeHolders;
    document.getElementById("badgePositionField").hidden = !hasBadges || !!t.noImages;
    badgePosInput.value = pos;
    var words = { 0: "Left", 50: "Centre", 100: "Right" };
    document.getElementById("badgePositionOut").textContent =
      (words[pos] || pos + "% across") + (own ? "" : " (style default)");
    document.getElementById("badgePositionReset").hidden = !own;
  }

  badgePosInput.addEventListener("input", function () {
    state.badgePosition = parseInt(badgePosInput.value, 10);
    render();
  });
  document.getElementById("badgePositionReset").addEventListener("click", function () {
    state.badgePosition = null;
    render();
  });

  document.getElementById("addBadgeBtn").addEventListener("click", function () {
    state.badges.push({ url: "", alt: "", width: S.badge.default });
    buildBadgeFields();
    render();
    var rows = badgeList.querySelectorAll(".badge-row");
    rows[rows.length - 1].querySelector("input").focus();
  });

  function buildIconFields() {
    var wrap = document.getElementById("iconFields");
    var labels = { web: "Website icon", phone: "Phone icon", email: "Email icon", social: "Social icon" };
    S.iconNames.forEach(function (name) {
      var label = document.createElement("label");
      label.textContent = labels[name] + " link";
      var input = document.createElement("input");
      input.type = "url";
      input.placeholder = "Default icon";
      input.value = state.icons[name] || "";
      input.addEventListener("input", function () {
        state.icons[name] = input.value;
        render();
      });
      label.appendChild(input);
      wrap.appendChild(label);
    });
  }

  /* ---------- Fonts ---------- */

  function buildFontFields() {
    var wrap = document.getElementById("fontFields");
    var autoLabels = { name: "Style default", title: "Same as details", footer: "Same as details" };
    S.fontRoles.forEach(function (role) {
      var label = document.createElement("label");
      label.textContent = role.label;
      var select = document.createElement("select");
      if (autoLabels[role.key]) select.appendChild(new Option(autoLabels[role.key], "auto"));
      Object.keys(S.fonts).forEach(function (key) {
        var opt = new Option(S.fonts[key].label, key);
        opt.style.fontFamily = S.fonts[key].stack;
        select.appendChild(opt);
      });
      select.value = state.fonts[role.key] || "auto";
      select.addEventListener("change", function () {
        state.fonts[role.key] = select.value;
        render();
      });
      label.appendChild(select);
      wrap.insertBefore(label, wrap.querySelector(".hint"));
    });
  }

  /* ---------- Text spacing ---------- */

  var LETTER = { min: -1, max: 6, step: 0.25 };
  var LINE = { min: 0.9, max: 2.5, step: 0.05, resting: 1.4 };

  function buildSpacingFields() {
    var wrap = document.getElementById("spacingFields");
    S.spacingRoles.forEach(function (role) {
      var row = document.createElement("div");
      row.className = "spacing-row";
      row.innerHTML =
        '<div class="spacing-head"><strong></strong>' +
        '<button type="button" class="link-button reset">Reset</button></div>' +
        '<label><span>Letter spacing <output data-out="letter"></output></span>' +
        '<input type="range" data-key="letter" min="' + LETTER.min + '" max="' + LETTER.max + '" step="' + LETTER.step + '"></label>' +
        '<label><span>Line spacing <output data-out="line"></output></span>' +
        '<input type="range" data-key="line" min="' + LINE.min + '" max="' + LINE.max + '" step="' + LINE.step + '"></label>';
      row.querySelector("strong").textContent = role.label;
      var letter = row.querySelector('[data-key="letter"]');
      var line = row.querySelector('[data-key="line"]');

      function current() { return state.spacing[role.key] || {}; }

      function sync() {
        var s = current();
        var l = parseFloat(s.letter) || 0;
        var h = parseFloat(s.line);
        letter.value = l;
        line.value = h > 0 ? h : LINE.resting;
        row.querySelector('[data-out="letter"]').textContent = l ? (l > 0 ? "+" : "") + l + "px" : "Normal";
        row.querySelector('[data-out="line"]').textContent = h > 0 ? h.toFixed(2) + "×" : "Auto";
        row.querySelector(".reset").hidden = !(l || h > 0);
      }

      function update(key, value) {
        state.spacing[role.key] = Object.assign({}, current());
        state.spacing[role.key][key] = value;
        sync();
        render();
      }

      letter.addEventListener("input", function () { update("letter", parseFloat(letter.value)); });
      line.addEventListener("input", function () { update("line", parseFloat(line.value)); });
      row.querySelector(".reset").addEventListener("click", function () {
        delete state.spacing[role.key];
        sync();
        render();
      });
      sync();
      wrap.appendChild(row);
    });
  }

  /* ---------- Colour themes ---------- */

  var themeGrid = document.getElementById("themeGrid");

  /* ---------- Colour fields: a picker plus a typed HEX / RGB code ---------- */

  var colourFields = [];

  // Accepts #1b2a4a, 1b2a4a, #abc, rgb(27, 42, 74), "27, 42, 74" or a colour
  // name. Returns lowercase #rrggbb, or "" if it isn't a colour.
  function parseColour(value) {
    var v = String(value || "").trim();
    if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) v = "#" + v;
    var nums = /^(?:rgb\s*\(\s*)?(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/i.exec(v);
    if (nums) {
      if ([nums[1], nums[2], nums[3]].some(function (n) { return parseInt(n, 10) > 255; })) return "";
      v = "rgb(" + nums[1] + "," + nums[2] + "," + nums[3] + ")";
    }
    var hex = S.importer.toHex(v);
    return HEX.test(hex) ? hex.toLowerCase() : "";
  }

  function formatColour(hex) {
    if (state.colourFormat !== "rgb") return hex;
    var n = parseInt(hex.slice(1), 16);
    return "rgb(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")";
  }

  // onChange receives #rrggbb. The returned element has .set(hex) to update it
  // from outside without disturbing someone mid-way through typing a code.
  function colourField(label, value, onChange) {
    var wrap = document.createElement("span");
    wrap.className = "colour-field";
    var picker = document.createElement("input");
    picker.type = "color";
    picker.setAttribute("aria-label", label + " colour picker");
    var code = document.createElement("input");
    code.type = "text";
    code.className = "colour-code";
    code.spellcheck = false;
    code.autocomplete = "off";
    code.setAttribute("aria-label", label + " colour code (HEX or RGB)");
    code.placeholder = "#000000";
    var current = value;

    function show() {
      picker.value = current;
      if (document.activeElement !== code) code.value = formatColour(current);
      code.classList.remove("invalid");
    }
    picker.addEventListener("input", function () {
      current = picker.value.toLowerCase();
      code.value = formatColour(current);
      onChange(current);
    });
    code.addEventListener("input", function () {
      var hex = parseColour(code.value);
      code.classList.toggle("invalid", !hex);
      if (!hex) return;
      current = hex;
      picker.value = hex;
      onChange(hex);
    });
    code.addEventListener("change", function () {
      code.value = formatColour(current);
      code.classList.remove("invalid");
    });
    code.addEventListener("keydown", function (e) {
      if (e.key === "Enter") code.blur();
    });

    wrap.appendChild(picker);
    wrap.appendChild(code);
    wrap.set = function (hex) { current = hex; show(); };
    wrap.refresh = show;
    show();
    colourFields.push(wrap);
    return wrap;
  }

  function refreshColourFields() {
    colourFields = colourFields.filter(function (f) { return f.isConnected; });
    colourFields.forEach(function (f) { f.refresh(); });
  }

  document.querySelectorAll('input[name="colourFormat"]').forEach(function (radio) {
    radio.checked = radio.value === state.colourFormat;
    radio.addEventListener("change", function () {
      if (!radio.checked) return;
      state.colourFormat = radio.value;
      refreshColourFields();
      if (isCustom()) buildCustomEditor(); // its "original colour" labels use the format too
      save();
    });
  });

  function chip(colour) {
    return '<span class="chip" style="background:' + colour + '"></span>';
  }

  function buildThemePicker() {
    S.themes.forEach(function (t) {
      var c = S.themeColours({ id: t.id });
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-card";
      b.dataset.theme = t.id;
      b.setAttribute("role", "radio");
      b.innerHTML = '<span class="chips">' + chip(c.name) + chip(c.divider) + chip(c.text) + "</span><span></span>";
      b.lastChild.textContent = t.name;
      b.addEventListener("click", function () { applyTheme({ id: t.id }); });
      themeGrid.appendChild(b);
    });

    // "Your colours": a theme built from the person's own main and accent colour.
    var custom = document.createElement("div");
    custom.className = "theme-card custom";
    custom.dataset.theme = "custom";
    custom.innerHTML =
      '<span class="custom-title">Your colours</span>' +
      '<span class="mini" data-slot="primary">Main</span>' +
      '<span class="mini" data-slot="accent">Accent</span>' +
      '<label class="mini check"><input type="checkbox"> Main colour for all text</label>';
    var mine = { primary: state.theme.primary || "#2b2b2b", accent: state.theme.accent || "#2b2b2b" };
    var solid = custom.querySelector("input[type=checkbox]");
    solid.checked = !!state.theme.solid;
    function applyMine() {
      applyTheme({ id: "custom", primary: mine.primary, accent: mine.accent, solid: solid.checked });
    }
    ["primary", "accent"].forEach(function (key) {
      var slot = custom.querySelector('[data-slot="' + key + '"]');
      slot.appendChild(colourField(key === "primary" ? "Main" : "Accent", mine[key], function (hex) {
        mine[key] = hex;
        applyMine();
      }));
    });
    solid.addEventListener("change", applyMine);
    themeGrid.appendChild(custom);
  }

  // A theme recolours every part, replacing any one-off changes.
  function applyTheme(theme) {
    if (theme.id === "custom") {
      state.theme = theme;
    } else {
      state.theme = Object.assign({}, state.theme, { id: theme.id });
    }
    state.colorOverrides = {};
    syncThemePicker();
    syncRoleRows();
    render();
  }

  function syncThemePicker() {
    themeGrid.querySelectorAll(".theme-card").forEach(function (card) {
      var on = card.dataset.theme === state.theme.id;
      card.setAttribute("aria-checked", String(on));
      card.classList.toggle("selected", on);
    });
  }

  /* ---------- Per-part colours ---------- */

  var roleList = document.getElementById("roleColours");

  function activeRoles() {
    var roles = S.findTemplate(state.template).roles.slice();
    if (state.footerStyle === "bar") roles.push("footerBg", "footerText");
    else roles.push("fineprint");
    // Keep the order of S.roles so related parts sit together.
    return S.roles.filter(function (r) { return roles.indexOf(r.key) >= 0; });
  }

  // Rebuilt when the style or footer type changes; otherwise only synced, so
  // an open colour picker isn't destroyed mid-drag.
  function buildRoleRows() {
    roleList.innerHTML = "";
    activeRoles().forEach(function (role) {
      var row = document.createElement("div");
      row.className = "role-row";
      row.dataset.role = role.key;
      var name = document.createElement("span");
      name.className = "role-name";
      name.textContent = role.label;
      row.appendChild(name);

      if (role.key === "icons") {
        // Default icons are hosted images, so only these colours exist.
        var strip = document.createElement("div");
        strip.className = "icon-swatches";
        S.iconColours.forEach(function (c) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "swatch small";
          b.style.background = c;
          b.dataset.colour = c;
          b.setAttribute("aria-label", "Icon colour " + c);
          b.addEventListener("click", function () { setRoleColour("icons", c); });
          strip.appendChild(b);
        });
        row.appendChild(strip);
      } else {
        row.colourField = colourField(role.label, colours()[role.key], function (hex) {
          setRoleColour(role.key, hex);
        });
        row.appendChild(row.colourField);
      }

      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "link-button reset";
      reset.textContent = "Reset";
      reset.title = "Back to the theme colour";
      reset.addEventListener("click", function () {
        delete state.colorOverrides[role.key];
        syncRoleRows();
        render();
      });
      row.appendChild(reset);
      roleList.appendChild(row);
    });
    syncRoleRows();
  }

  function setRoleColour(role, colour) {
    state.colorOverrides[role] = colour.toLowerCase();
    syncRoleRows();
    render();
  }

  function syncRoleRows() {
    var c = colours();
    roleList.querySelectorAll(".role-row").forEach(function (row) {
      var key = row.dataset.role;
      if (row.colourField) row.colourField.set(c[key]);
      row.querySelectorAll(".swatch").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.colour === S.nearestIconColour(c[key])));
      });
      row.querySelector(".reset").hidden = !(key in state.colorOverrides);
      row.classList.toggle("changed", key in state.colorOverrides);
    });
  }

  /* ---------- Opening an existing signature ---------- */

  var importStatus = document.getElementById("importStatus");

  function setImportStatus(text, kind) {
    importStatus.textContent = text;
    importStatus.className = "hint full" + (kind ? " " + kind : "");
  }

  // Outlook saves signature files in the PC's own character set, not always
  // UTF-8, so read the charset the file declares before decoding it.
  function decodeFile(buffer) {
    var head = new TextDecoder("ascii").decode(buffer.slice(0, 4096));
    var m = /charset\s*=\s*["']?([\w\-]+)/i.exec(head);
    try {
      return new TextDecoder(m ? m[1] : "utf-8").decode(buffer);
    } catch (e) {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }

  function openSignature(html, sourceName) {
    setImportStatus("Reading your signature…");
    S.importer.importHtml(html, sourceName).then(function (result) {
      if (result.settings) {
        if (!confirm("This signature was made with SignOff. Open it with all its settings? This replaces what's in the editor now.")) {
          setImportStatus("");
          return;
        }
        clearTimeout(saveTimer);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalise(result.settings))); } catch (e) { /* ignore */ }
        location.reload();
        return;
      }
      var found = S.importer.recognise(result.custom.html);
      if (found) {
        var styleName = S.findTemplate(found.template).name;
        if (confirm("Rebuild this signature in SignOff's " + styleName + " style, with all its details editable?\n\n" +
          "OK: rebuild it as " + styleName + " (replaces the details in the editor now).\n" +
          "Cancel: keep its exact original layout as a Custom style instead.")) {
          rebuildFrom(found);
          return;
        }
      }
      if (state.custom && !confirm("Replace your current custom style with this signature?")) {
        setImportStatus("");
        return;
      }
      state.custom = result.custom;
      syncCustomCard();
      setTemplate("custom");
      var problems = S.importer.parts(state.custom.html).images.filter(function (img) {
        return S.importer.imageProblem(img.src);
      }).length;
      setImportStatus("Opened as a Custom style. Edit it in step 2." +
        (problems ? " " + problems + (problems === 1 ? " image needs" : " images need") + " a web link before it will show in emails." : ""),
        problems ? "warn" : "ok");
      document.getElementById("customPanel").open = true;
    }, function (err) {
      setImportStatus(err.message || "Couldn't open that signature.", "error");
    });
  }

  // Replaces the details in the editor with ones read from an existing
  // signature, in the built-in style it most resembles. Anything not found is
  // cleared, so details from the old draft don't linger.
  function rebuildFrom(found) {
    var c = found.colors;
    var primary = c.name || c.headerBg || state.theme.primary;
    var next = Object.assign({}, state, {
      template: found.template,
      name: found.name || "",
      jobTitle: found.jobTitle || "",
      company: found.company || "",
      phone: found.phone || "",
      mobile: found.mobile || "",
      email: found.email || "",
      website: found.website || "",
      address: found.address || "",
      logoUrl: found.logoUrl || "",
      logoWidth: found.logoWidth || state.logoWidth,
      social: found.social,
      socialText: found.socialText || "",
      socialTextUrl: found.socialTextUrl || "",
      badges: found.badges,
      footerText: found.footerText || "",
      footerStyle: found.footerStyle || "text",
      theme: { id: "custom", primary: primary, accent: c.divider || primary, solid: false },
      colorOverrides: c,
      fonts: Object.assign({}, state.fonts, found.fonts || {})
    });
    clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalise(next))); } catch (e) { /* ignore */ }
    location.reload();
  }

  function openFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setImportStatus("That file is too large to be an email signature.", "error");
      return;
    }
    file.arrayBuffer().then(function (buf) { openSignature(decodeFile(buf), file.name); });
  }

  document.getElementById("importFile").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    openFile(file);
  });

  // Files can also be dragged onto the panel, which works even where a
  // browser can't open a file picker.
  var importPanel = document.querySelector(".import-panel");
  ["dragenter", "dragover"].forEach(function (type) {
    importPanel.addEventListener(type, function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      importPanel.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach(function (type) {
    importPanel.addEventListener(type, function () { importPanel.classList.remove("dragging"); });
  });
  importPanel.addEventListener("drop", function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    importPanel.open = true;
    openFile(e.dataTransfer.files[0]);
  });

  var pasteBox = document.getElementById("importPaste");
  pasteBox.addEventListener("paste", function (e) {
    e.preventDefault();
    var data = e.clipboardData;
    var html = data.getData("text/html");
    if (!html) {
      var text = data.getData("text/plain");
      if (!text.trim()) return;
      html = S.esc(text).replace(/\r?\n/g, "<br>");
    }
    openSignature(html, "Pasted signature");
  });
  // The box only ever receives pastes; typing into it does nothing.
  pasteBox.addEventListener("beforeinput", function (e) {
    if (e.inputType !== "insertFromPaste") e.preventDefault();
  });

  /* ---------- Custom style editor ---------- */

  var customEditor = document.getElementById("customEditor");

  function section(title, hint) {
    var wrap = document.createElement("div");
    wrap.className = "custom-section";
    var h = document.createElement("h3");
    h.textContent = title;
    wrap.appendChild(h);
    if (hint) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = hint;
      wrap.appendChild(p);
    }
    customEditor.appendChild(wrap);
    return wrap;
  }

  function field(labelText, input) {
    var label = document.createElement("label");
    var span = document.createElement("span");
    span.textContent = labelText;
    label.appendChild(span);
    label.appendChild(input);
    return label;
  }

  function textInput(value, type) {
    var input = document.createElement("input");
    input.type = type || "text";
    input.value = value;
    return input;
  }

  // Built when the custom style is chosen or replaced; edits only re-render the preview.
  function buildCustomEditor() {
    customEditor.innerHTML = "";
    var c = state.custom;
    if (!c) return;
    var parts = S.importer.parts(c.html);

    var texts = section("Text", "Change any wording. Spacing and styling stay as they were.");
    parts.texts.forEach(function (original, i) {
      var value = i in c.textEdits ? c.textEdits[i] : original;
      var input = value.length > 60 ? document.createElement("textarea") : textInput(value);
      if (input.tagName === "TEXTAREA") { input.rows = 2; input.value = value; }
      input.addEventListener("input", function () {
        if (input.value === original) delete c.textEdits[i];
        else c.textEdits[i] = input.value;
        render();
      });
      texts.appendChild(field("Text " + (i + 1), input));
    });

    if (parts.links.length) {
      var links = section("Links", "Where each link goes when clicked.");
      parts.links.forEach(function (l, i) {
        var input = textInput(i in c.linkEdits ? c.linkEdits[i] : l.href, "url");
        input.addEventListener("input", function () {
          if (!input.value.trim() || input.value === l.href) delete c.linkEdits[i];
          else c.linkEdits[i] = input.value;
          render();
        });
        links.appendChild(field(l.text ? "“" + l.text.slice(0, 40) + "”" : "Link " + (i + 1), input));
      });
    }

    if (parts.images.length) {
      var images = section("Images", "Images must be on the web (an https:// link) to show in emails. Images that aren't are left out when you copy.");
      parts.images.forEach(function (img, i) {
        var edit = c.imageEdits[i] || {};
        var box = document.createElement("div");
        box.className = "custom-image";
        var thumb = document.createElement("img");
        thumb.alt = "";
        var problem = document.createElement("p");
        problem.className = "hint error";
        var src = textInput(edit.src || img.src, "url");
        var width = textInput(edit.width || img.width || "", "number");
        width.min = 10;
        width.max = 600;
        var alt = textInput(edit.alt !== undefined ? edit.alt : img.alt);
        function sync() {
          var s = src.value.trim() || img.src;
          thumb.src = /^(https?:|data:image\/)/i.test(s) ? s : "";
          problem.textContent = S.importer.imageProblem(s);
          problem.hidden = !problem.textContent;
        }
        function update() {
          c.imageEdits[i] = {
            src: src.value.trim() === img.src ? "" : src.value.trim(),
            alt: alt.value,
            width: parseInt(width.value, 10) || 0
          };
          sync();
          render();
        }
        [src, width, alt].forEach(function (el) { el.addEventListener("input", update); });
        box.appendChild(thumb);
        var fields = document.createElement("div");
        fields.className = "custom-image-fields";
        fields.appendChild(problem);
        fields.appendChild(field("Image link", src));
        fields.appendChild(field("Width (px)", width));
        fields.appendChild(field("Description", alt));
        box.appendChild(fields);
        images.appendChild(box);
        sync();
      });
    }

    if (parts.colours.length) {
      var colours = section("Colours", "Swap any colour for another. Every place it's used changes together.");
      parts.colours.forEach(function (hex) {
        var row = document.createElement("div");
        row.className = "role-row";
        var name = document.createElement("span");
        name.className = "role-name";
        name.innerHTML = '<span class="chip" style="background:' + hex + '"></span> ';
        name.appendChild(document.createTextNode(formatColour(hex)));
        var input = colourField("Replacement for " + hex, c.colourSwaps[hex] || hex, function (value) {
          if (value === hex) delete c.colourSwaps[hex];
          else c.colourSwaps[hex] = value;
          sync();
          render();
        });
        var reset = document.createElement("button");
        reset.type = "button";
        reset.className = "link-button reset";
        reset.textContent = "Reset";
        function sync() {
          reset.hidden = !(hex in c.colourSwaps);
          row.classList.toggle("changed", hex in c.colourSwaps);
        }
        reset.addEventListener("click", function () {
          delete c.colourSwaps[hex];
          input.set(hex);
          sync();
          render();
        });
        row.appendChild(name);
        row.appendChild(input);
        row.appendChild(reset);
        colours.appendChild(row);
        sync();
      });
    }

    if (parts.fonts.length) {
      var fonts = section("Fonts", "Fonts other email apps may not have are worth swapping for one of these.");
      parts.fonts.forEach(function (family) {
        var select = document.createElement("select");
        select.appendChild(new Option("Keep " + family, ""));
        Object.keys(S.fonts).forEach(function (key) {
          select.appendChild(new Option(S.fonts[key].label, key));
        });
        select.value = c.fontSwaps[family] || "";
        select.addEventListener("change", function () {
          if (select.value) c.fontSwaps[family] = select.value;
          else delete c.fontSwaps[family];
          render();
        });
        fonts.appendChild(field(family, select));
      });
    }
  }

  document.getElementById("removeCustomBtn").addEventListener("click", function () {
    if (!confirm("Remove this custom style? Your other settings are kept.")) return;
    state.custom = null;
    syncCustomCard();
    setTemplate(DEFAULTS.template);
    setImportStatus("");
  });

  /* ---------- Simple fields ---------- */

  function bindFields() {
    document.querySelectorAll("[data-field]").forEach(function (el) {
      var key = el.dataset.field;
      if (el.type === "radio") {
        el.checked = state[key] === el.value;
        el.addEventListener("change", function () {
          if (!el.checked) return;
          state[key] = el.value;
          if (key === "footerStyle") buildRoleRows();
          render();
        });
        return;
      }
      el.value = state[key] == null ? "" : state[key];
      el.addEventListener("input", function () {
        state[key] = el.type === "range" ? parseInt(el.value, 10) : el.value;
        if (key === "logoUrl") checkLogo();
        if (key === "logoWidth") updateLogoWidth();
        if (key === "titleGap") updateTitleGap();
        render();
      });
    });
    updateLogoWidth();
    updateTitleGap();
  }

  function updateTitleGap() {
    document.getElementById("titleGapOut").textContent = state.titleGap > 0 ? "+" + state.titleGap + "px" : "None";
  }

  function updateLogoWidth() {
    document.getElementById("logoWidthOut").textContent = state.logoWidth + "px";
  }

  /* ---------- Logo check ---------- */

  var logoStatus = document.getElementById("logoStatus");
  var logoTimer;
  var logoToken = 0;

  function setLogoStatus(text, kind) {
    logoStatus.textContent = text;
    logoStatus.className = "hint full" + (kind ? " " + kind : "");
  }

  function checkLogo() {
    clearTimeout(logoTimer);
    var url = (state.logoUrl || "").trim();
    var token = ++logoToken;
    if (!url) { setLogoStatus("No logo yet. That's fine: every style works without one."); return; }
    if (/^data:/i.test(url)) { setLogoStatus("This is an embedded image. Most email apps block these, so please use a web link instead.", "error"); return; }
    if (/^http:\/\//i.test(url)) { setLogoStatus("This link starts with http://. Email apps need a secure https:// link.", "error"); return; }
    if (!/^https:\/\//i.test(url)) { setLogoStatus("Paste a full link starting with https://", "error"); return; }
    if (/(1drv\.ms|onedrive\.live|sharepoint\.com|drive\.google|dropbox\.com|photos\.app\.goo)/i.test(url)) {
      setLogoStatus("This looks like a file-sharing link. These usually open a viewer page, not the image, so the logo will appear broken in emails.", "warn");
      return;
    }
    setLogoStatus("Checking image…");
    logoTimer = setTimeout(function () {
      var img = new Image();
      img.onload = function () {
        if (token !== logoToken) return;
        var w = img.naturalWidth;
        var msg = "Image found (" + w + " × " + img.naturalHeight + "px).";
        if (w < state.logoWidth * 2) {
          setLogoStatus(msg + " For a crisp logo on high-resolution screens, use an image at least " + state.logoWidth * 2 + "px wide.", "warn");
        } else {
          setLogoStatus(msg + " Looks good.", "ok");
        }
      };
      img.onerror = function () {
        if (token !== logoToken) return;
        setLogoStatus("Couldn't load an image from this link. Check it opens on its own in a new browser tab and ends in .png or .jpg.", "error");
      };
      img.src = url;
    }, 400);
  }

  /* ---------- Copy / download ---------- */

  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(text, isError) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.className = "toast" + (isError ? " error" : "");
    toastTimer = setTimeout(function () { toastEl.textContent = ""; }, 4000);
  }

  // Puts exactly our HTML on the clipboard by answering the browser's own copy
  // event. Copying a page selection instead makes browsers add the page's
  // styling (such as its background colour), which mail apps then keep.
  function copyExact(html, text) {
    var ok = false;
    function onCopy(e) {
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      ok = true;
    }
    document.addEventListener("copy", onCopy);
    try { document.execCommand("copy"); } catch (e) { ok = false; }
    document.removeEventListener("copy", onCopy);
    return ok;
  }

  function copyRich() {
    var html = signatureHtml();
    var text = signatureText();
    if (copyExact(html, text)) return Promise.resolve(true);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      var item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      });
      return navigator.clipboard.write([item]).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function copyPlain(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return Promise.resolve(ok);
  }

  document.getElementById("copyBtn").addEventListener("click", function () {
    copyRich().then(function (ok) {
      ok ? toast("Copied! Now paste it into your email settings (see below).")
         : toast("Couldn't copy automatically. Select the signature in the preview and press Ctrl+C.", true);
    });
  });

  document.getElementById("copyHtmlBtn").addEventListener("click", function () {
    copyPlain(signatureHtml()).then(function (ok) {
      ok ? toast("HTML code copied.") : toast("Couldn't copy the HTML. Try a different browser.", true);
    });
  });

  document.getElementById("downloadBtn").addEventListener("click", function () {
    var title = S.esc((state.name || "Email") + " signature");
    var doc = "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>" + title +
      "</title></head>\n<body>\n" + signatureHtml() + "\n" +
      // Lets SignOff reopen this file with every setting intact.
      S.importer.settingsComment(state) + "\n</body></html>\n";
    var blob = new Blob([doc], { type: "text/html" });
    var a = document.createElement("a");
    var slug = (state.name || "signature").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "signature";
    a.href = URL.createObjectURL(blob);
    a.download = slug + "-signature.htm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Downloaded " + a.download);
  });

  /* ---------- Install tabs ---------- */

  var tabs = document.querySelectorAll("#installTabs [role=tab]");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t === tab)); });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    });
  });

  /* ---------- Reset ---------- */

  document.getElementById("resetBtn").addEventListener("click", function () {
    if (!confirm("Clear everything and start again?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });

  /* ---------- Start ---------- */

  buildTemplatePicker();
  buildThemePicker();
  syncThemePicker();
  buildFontFields();
  buildSpacingFields();
  buildSocialFields();
  buildBadgeFields();
  buildIconFields();
  bindFields();
  buildRoleRows();
  if (isCustom()) buildCustomEditor();
  syncTemplateSections();
  checkLogo();
  render();
})();
