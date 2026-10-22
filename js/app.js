(function () {
  "use strict";

  var S = window.SignOff;
  var STORAGE_KEY = "signoff:v1";
  var BADGE_SLOTS = 3;

  var BRAND_COLOURS = [
    "#1b2a4a", "#1f4b99", "#0f766e", "#2f6b3a", "#7c2d12",
    "#b42318", "#9d174d", "#5b21b6", "#2b2b2b"
  ];

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
    badges: [],
    brandColor: "#1f4b99",
    font: "arial",
    footerText: "",
    footerStyle: "text"
  };

  var state = load();

  /* ---------- Persistence ---------- */

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    var data = clone(DEFAULTS);
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        Object.keys(DEFAULTS).forEach(function (k) {
          if (k in saved) data[k] = saved[k];
        });
        data.social = Object.assign({}, saved.social || {});
        data.badges = Array.isArray(saved.badges) ? saved.badges.slice(0, BADGE_SLOTS) : [];
      }
    } catch (e) { /* storage blocked or corrupt: fall back to defaults */ }
    if (!/^#[0-9a-f]{6}$/i.test(data.brandColor)) data.brandColor = DEFAULTS.brandColor;
    if (!S.fonts[data.font]) data.font = DEFAULTS.font;
    return data;
  }

  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 250);
  }

  /* ---------- Rendering ---------- */

  var previewEl = document.getElementById("preview");
  var templateGrid = document.getElementById("templateGrid");

  function signatureHtml() {
    return S.render(state.template, state);
  }

  function render() {
    previewEl.innerHTML = signatureHtml();
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
      card.addEventListener("click", function () {
        state.template = t.id;
        render();
      });
      templateGrid.appendChild(card);
    });
  }

  function renderThumbs() {
    Array.prototype.forEach.call(templateGrid.children, function (card) {
      card.querySelector(".thumb-inner").innerHTML = S.render(card.dataset.template, state);
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
    var i = (ids.indexOf(state.template) + keys[e.key] + ids.length) % ids.length;
    state.template = ids[i];
    render();
    templateGrid.querySelector('[data-template="' + ids[i] + '"]').focus();
  });

  function buildSocialFields() {
    var wrap = document.getElementById("socialFields");
    S.socials.forEach(function (s) {
      var label = document.createElement("label");
      label.textContent = s.label;
      var input = document.createElement("input");
      input.type = "url";
      input.placeholder = s.key === "x" ? "x.com/yourname" : s.key + ".com/yourname";
      input.value = state.social[s.key] || "";
      input.addEventListener("input", function () {
        state.social[s.key] = input.value;
        render();
      });
      label.appendChild(input);
      wrap.appendChild(label);
    });
  }

  function buildBadgeFields() {
    var wrap = document.getElementById("badgeFields");
    for (var i = 0; i < BADGE_SLOTS; i++) {
      (function (i) {
        var badge = state.badges[i] || {};
        var row = document.createElement("div");
        row.className = "badge-row";
        row.innerHTML =
          '<label>Badge ' + (i + 1) + ' image link<input type="url" placeholder="https://…/badge.png"></label>' +
          '<label>Description<input type="text" placeholder="e.g. Industry Award 2026"></label>';
        var inputs = row.querySelectorAll("input");
        inputs[0].value = badge.url || "";
        inputs[1].value = badge.alt || "";
        var update = function () {
          state.badges[i] = { url: inputs[0].value, alt: inputs[1].value };
          render();
        };
        inputs[0].addEventListener("input", update);
        inputs[1].addEventListener("input", update);
        wrap.appendChild(row);
      })(i);
    }
  }

  function buildFontSelect() {
    var select = document.getElementById("fontSelect");
    Object.keys(S.fonts).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = S.fonts[key].label;
      opt.style.fontFamily = S.fonts[key].stack;
      select.appendChild(opt);
    });
  }

  function buildSwatches() {
    var wrap = document.getElementById("swatches");
    wrap.setAttribute("role", "radiogroup");
    wrap.setAttribute("aria-label", "Brand colour");
    BRAND_COLOURS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.style.background = c;
      b.dataset.colour = c;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", c);
      b.addEventListener("click", function () { setColour(c); });
      wrap.appendChild(b);
    });
    var custom = document.createElement("label");
    custom.className = "custom-colour";
    custom.innerHTML = '<input type="color" aria-label="Custom colour"> Custom';
    var picker = custom.querySelector("input");
    picker.addEventListener("input", function () { setColour(picker.value); });
    wrap.appendChild(custom);
    syncSwatches();
  }

  function setColour(c) {
    state.brandColor = c;
    syncSwatches();
    render();
  }

  function syncSwatches() {
    var current = state.brandColor.toLowerCase();
    document.querySelectorAll(".swatch").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.colour === current));
    });
    document.querySelector(".custom-colour input").value = current;
  }

  /* ---------- Simple fields ---------- */

  function bindFields() {
    document.querySelectorAll("[data-field]").forEach(function (el) {
      var key = el.dataset.field;
      if (el.type === "radio") {
        el.checked = state[key] === el.value;
        el.addEventListener("change", function () { if (el.checked) { state[key] = el.value; render(); } });
        return;
      }
      el.value = state[key] == null ? "" : state[key];
      el.addEventListener("input", function () {
        state[key] = el.type === "range" ? parseInt(el.value, 10) : el.value;
        if (key === "logoUrl") checkLogo();
        if (key === "logoWidth") updateLogoWidth();
        render();
      });
    });
    updateLogoWidth();
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

  // Copies the rendered signature by selecting it, the same as a person
  // highlighting it and pressing Ctrl+C. Mail editors handle this most reliably.
  function copyBySelection(el) {
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    sel.removeAllRanges();
    return ok;
  }

  function copyRich() {
    var html = signatureHtml();
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      var item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([S.renderText(state)], { type: "text/plain" })
      });
      return navigator.clipboard.write([item]).then(function () { return true; }, function () {
        return copyBySelection(previewEl);
      });
    }
    return Promise.resolve(copyBySelection(previewEl));
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
      "</title></head>\n<body>\n" + signatureHtml() + "\n</body></html>\n";
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
  buildFontSelect();
  buildSwatches();
  buildSocialFields();
  buildBadgeFields();
  bindFields();
  checkLogo();
  render();
})();
