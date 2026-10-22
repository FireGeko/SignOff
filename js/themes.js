/*
 * SignOff colour themes.
 *
 * A theme gives every part ("role") of a signature a colour. People pick a
 * theme, then override any single role. Templates only ever ask for a role's
 * colour, never a raw value.
 */
(function () {
  "use strict";

  var INK = "#2b2b2b";
  var MUTED = "#6b6b6b";
  var LIGHT = "#e3e3e3";
  var WHITE = "#ffffff";

  // Every colourable part of a signature. Templates list the roles they use,
  // so the editor only shows controls that do something.
  var ROLES = [
    { key: "name", label: "Name" },
    { key: "title", label: "Job title and company" },
    { key: "headerBg", label: "Header background" },
    { key: "headerText", label: "Header text" },
    { key: "text", label: "Contact details" },
    { key: "label", label: "Contact labels (T, M, E, W)" },
    { key: "icons", label: "Contact icons" },
    { key: "address", label: "Address" },
    { key: "social", label: "Social links" },
    { key: "freeText", label: "Free text (follows contact details unless changed)" },
    { key: "divider", label: "Dividers and accent lines" },
    { key: "border", label: "Borders and separators" },
    { key: "footerBg", label: "Footer bar" },
    { key: "footerText", label: "Footer bar text" },
    { key: "fineprint", label: "Footer text" }
  ];

  // Default icons are hosted PNGs, so they only exist in these colours
  // (see tools/make_icons.py). Every theme colour is in this list.
  var ICON_COLOURS = [
    "#1b2a4a", "#1f4b99", "#0f4c5c", "#0f766e", "#2f6b3a", "#8a6d1d", "#7c2d12",
    "#c2410c", "#b42318", "#9d174d", "#5b21b6", "#2b2b2b", "#6b6b6b"
  ];

  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function nearestIconColour(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return INK;
    var target = rgb(hex.toLowerCase());
    var best = ICON_COLOURS[0], bestDist = Infinity;
    ICON_COLOURS.forEach(function (c) {
      var v = rgb(c);
      var dist = Math.pow(v[0] - target[0], 2) + Math.pow(v[1] - target[1], 2) + Math.pow(v[2] - target[2], 2);
      if (dist < bestDist) { bestDist = dist; best = c; }
    });
    return best;
  }

  // Builds a full set of role colours from a main colour and an accent.
  // "solid" puts the main colour on all the text, like a single-colour letterhead.
  function makeColours(primary, accent, solid) {
    return {
      name: primary,
      title: solid ? primary : MUTED,
      headerBg: primary,
      headerText: WHITE,
      text: solid ? primary : INK,
      label: accent,
      icons: nearestIconColour(primary),
      address: solid ? primary : MUTED,
      social: accent,
      freeText: solid ? primary : INK,
      divider: solid ? primary : accent,
      border: LIGHT,
      footerBg: primary,
      footerText: WHITE,
      fineprint: MUTED
    };
  }

  var THEMES = [
    { id: "navy", name: "Navy", primary: "#1b2a4a", accent: "#1f4b99" },
    { id: "navy-solid", name: "Navy solid", primary: "#1b2a4a", accent: "#1b2a4a", solid: true },
    { id: "ocean", name: "Ocean", primary: "#0f4c5c", accent: "#0f766e" },
    { id: "forest", name: "Forest", primary: "#2f6b3a", accent: "#8a6d1d" },
    { id: "terracotta", name: "Terracotta", primary: "#7c2d12", accent: "#c2410c" },
    { id: "berry", name: "Berry", primary: "#9d174d", accent: "#5b21b6" },
    { id: "royal", name: "Royal", primary: "#5b21b6", accent: "#1f4b99" },
    { id: "crimson", name: "Crimson", primary: "#2b2b2b", accent: "#b42318" },
    { id: "graphite", name: "Graphite", primary: "#2b2b2b", accent: "#6b6b6b" }
  ];

  // theme: { id, primary?, accent?, solid? }. "custom" uses its own colours.
  function themeColours(theme) {
    var t = theme || {};
    if (t.id === "custom") return makeColours(t.primary || INK, t.accent || t.primary || INK, !!t.solid);
    var preset = THEMES.filter(function (x) { return x.id === t.id; })[0] || THEMES[0];
    return makeColours(preset.primary, preset.accent, !!preset.solid);
  }

  window.SignOff = window.SignOff || {};
  window.SignOff.roles = ROLES;
  window.SignOff.themes = THEMES;
  window.SignOff.iconColours = ICON_COLOURS;
  window.SignOff.nearestIconColour = nearestIconColour;
  window.SignOff.themeColours = themeColours;
})();
