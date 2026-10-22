/*
 * SignOff signature templates.
 *
 * Every template returns a string of email-safe HTML:
 *   - table layout only, all styles inline (no <style>, no classes, no flexbox/grid)
 *   - system fonts only (web fonts are ignored by most mail clients)
 *   - images by public HTTPS URL only (base64 / data: images are blocked by most clients)
 *   - every image has alt text and a width attribute
 * All user text goes through esc() before it touches the markup.
 *
 * Colours and fonts are looked up by role (see js/themes.js), never hard-coded,
 * so every part of every style can be recoloured.
 */
(function () {
  "use strict";

  var S = window.SignOff;

  var FONTS = {
    arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
    helvetica: { label: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
    verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
    tahoma: { label: "Tahoma", stack: "Tahoma, Verdana, sans-serif" },
    trebuchet: { label: "Trebuchet MS", stack: "'Trebuchet MS', Arial, sans-serif" },
    georgia: { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
    times: { label: "Times New Roman", stack: "'Times New Roman', Times, serif" }
  };

  // Parts of the signature that can have their own font.
  var FONT_ROLES = [
    { key: "body", label: "Details font" },
    { key: "name", label: "Name font" },
    { key: "title", label: "Job title font" },
    { key: "footer", label: "Footer font" }
  ];

  // profile: turns an @handle into a full profile link.
  var SOCIALS = [
    { key: "linkedin", label: "LinkedIn", profile: "https://www.linkedin.com/in/" },
    { key: "instagram", label: "Instagram", profile: "https://www.instagram.com/" },
    { key: "facebook", label: "Facebook", profile: "https://www.facebook.com/" },
    { key: "x", label: "X", profile: "https://x.com/" },
    { key: "tiktok", label: "TikTok", profile: "https://www.tiktok.com/@" },
    { key: "youtube", label: "YouTube", profile: "https://www.youtube.com/@" },
    { key: "bluesky", label: "Bluesky", profile: "https://bsky.app/profile/" }
  ];

  // Accepts a full link, a bare domain path, or an @handle.
  function socialUrl(s, value) {
    var v = trim(value);
    var handle = /^@([\w.\-]+)$/.exec(v);
    if (handle) return s.profile + handle[1];
    return webUrl(v);
  }

  // Hosted default icons (see tools/make_icons.py).
  var ICON_VERSION = "v1";

  var BADGE_DEFAULT = 64;
  var BADGE_MIN = 24;
  var BADGE_MAX = 200;

  // Per-render options: { preview, assetBase, nameFont }.
  var opts = {};

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function trim(value) {
    return String(value == null ? "" : value).trim();
  }

  // Returns an https:// URL, or "" if the value can't safely be used as a link.
  function webUrl(value) {
    var v = trim(value);
    if (!v) return "";
    if (/^http:\/\//i.test(v)) v = "https://" + v.slice(7);
    if (!/^https:\/\//i.test(v)) {
      if (/^[a-z]+:/i.test(v)) return ""; // javascript:, data:, etc.
      v = "https://" + v.replace(/^\/+/, "");
    }
    return v;
  }

  function displayUrl(value) {
    return trim(value).replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }

  function telUrl(value) {
    var digits = trim(value).replace(/[^\d+]/g, "");
    return digits ? "tel:" + digits : "";
  }

  // Images must be https. Anything else is dropped rather than shipped broken.
  function imageUrl(value) {
    var v = trim(value);
    return /^https:\/\//i.test(v) ? v : "";
  }

  function hasText(value) {
    return trim(value) !== "";
  }

  /* ---------- Colours and fonts by role ---------- */

  var fallbackColours = S.themeColours();

  function col(d, role) {
    var v = d.colors && d.colors[role];
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallbackColours[role];
  }

  function stack(key) {
    return (FONTS[key] || FONTS.arial).stack;
  }

  // "auto" means: the style's own choice for the name, otherwise the details font.
  function fnt(d, role) {
    var fonts = d.fonts || {};
    if (role === "body") return stack(fonts.body);
    var v = fonts[role];
    if (!v || v === "auto") v = (role === "name" && opts.nameFont) || fonts.body;
    return stack(v);
  }

  // Parts of the signature with their own letter and line spacing.
  var SPACING_ROLES = [
    { key: "name", label: "Name" },
    { key: "title", label: "Job title and company" },
    { key: "text", label: "Contact details" },
    { key: "address", label: "Address" },
    { key: "social", label: "Social links and free text" },
    { key: "footer", label: "Footer" }
  ];

  // Text size plus spacing for a part. Line spacing overrides are a multiple
  // of the font size, written as exact pixels because Outlook ignores multipliers.
  function ts(d, role, size, defaultLineHeight) {
    var s = (d.spacing && d.spacing[role]) || {};
    var line = parseFloat(s.line);
    var letter = parseFloat(s.letter);
    return "font-size:" + size + "px;" +
      (line > 0
        ? "line-height:" + Math.round(size * line) + "px;mso-line-height-rule:exactly;"
        : "line-height:" + defaultLineHeight + ";") +
      (letter ? "letter-spacing:" + letter + "px;" : "");
  }

  // Extra space (px) between the name/title block and the rest of the signature.
  function titleGap(d) {
    var g = parseInt(d.titleGap, 10);
    return g > 0 ? Math.min(g, 60) : 0;
  }

  // A fixed-height empty row. Outlook ignores padding on divs, so vertical
  // space inside a cell is made with one of these instead.
  function spacer(height) {
    return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>' +
      '<td height="' + height + '" style="height:' + height + "px;line-height:" + height + 'px;font-size:1px;">&nbsp;</td></tr></table>';
  }

  /* ---------- Shared pieces ---------- */

  function link(href, text, color, bold) {
    return '<a href="' + esc(href) + '" style="color:' + color + ";text-decoration:none;" +
      (bold ? "font-weight:bold;" : "") + '">' + esc(text) + "</a>";
  }

  // Contact details as a list of small HTML fragments with letter labels.
  function contactItems(d) {
    var items = [];
    var text = col(d, "text");
    var label = function (t) {
      return '<span style="color:' + col(d, "label") + ';font-weight:bold;">' + t + "</span>&nbsp;";
    };
    if (hasText(d.phone)) items.push(label("T") + link(telUrl(d.phone), trim(d.phone), text));
    if (hasText(d.mobile)) items.push(label("M") + link(telUrl(d.mobile), trim(d.mobile), text));
    if (hasText(d.email)) items.push(label("E") + link("mailto:" + trim(d.email), trim(d.email), text));
    if (webUrl(d.website)) items.push(label("W") + link(webUrl(d.website), displayUrl(d.website), text));
    return items;
  }

  function addressHtml(d, lineBreaks) {
    if (!hasText(d.address)) return "";
    return '<span style="color:' + col(d, "address") + ';">' +
      esc(trim(d.address)).replace(/\r?\n/g, lineBreaks ? "<br>" : ", ") + "</span>";
  }

  // The social line: optional free text (a handle or call to action, linked if
  // a link is given) followed by any platform links.
  function socialHtml(d, separator, bold) {
    var parts = [];
    if (hasText(d.socialText)) {
      var url = webUrl(d.socialTextUrl);
      parts.push(url
        ? link(url, trim(d.socialText), col(d, "freeText"), bold !== false)
        : '<span style="color:' + col(d, "freeText") + ";" + (bold !== false ? "font-weight:bold;" : "") + '">' +
          esc(trim(d.socialText)) + "</span>");
    }
    SOCIALS.forEach(function (s) {
      var url = socialUrl(s, d.social && d.social[s.key]);
      if (url) parts.push(link(url, s.label, col(d, "social"), bold !== false));
    });
    return parts.join(separator || "&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
  }

  // Grey "holding" images shown in the editor preview only, so people can see
  // where a logo or badge would sit. They are never part of copied output.
  function placeholderSrc(w, h, label, round) {
    var shape = round
      ? '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (w / 2 - 1) + '"'
      : '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="6"';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' +
      shape + ' fill="#f1f0ed" stroke="#c9c5bd" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, sans-serif" font-size="' +
      Math.max(8, Math.round(Math.min(w, 120) / 6.5)) + '" fill="#8a867e">' + label + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function logoHtml(d, placeholder) {
    var src = imageUrl(d.logoUrl);
    var w = Math.max(40, Math.min(300, parseInt(d.logoWidth, 10) || 120));
    if (!src) {
      if (!placeholder) return "";
      return '<img src="' + placeholderSrc(w, Math.round(w * 0.45), "Your logo") + '" alt="" width="' + w +
        '" data-placeholder="logo" style="display:block;border:0;">';
    }
    var alt = hasText(d.company) ? trim(d.company) : "Logo";
    var img = '<img src="' + esc(src) + '" alt="' + esc(alt) + '" width="' + w + '" ' +
      'style="display:block;border:0;outline:none;width:' + w + "px;max-width:" + w + 'px;height:auto;">';
    var href = webUrl(d.website);
    return href ? '<a href="' + esc(href) + '" style="text-decoration:none;">' + img + "</a>" : img;
  }

  function badgeWidth(b) {
    var w = parseInt(b && b.width, 10);
    return isNaN(w) ? BADGE_DEFAULT : Math.max(BADGE_MIN, Math.min(BADGE_MAX, w));
  }

  // Award / accreditation badges in a single row, each at its own size.
  function badgesHtml(d, placeholder) {
    var cells = [];
    (d.badges || []).forEach(function (b) {
      var src = imageUrl(b && b.url);
      var w = badgeWidth(b);
      if (src) {
        var alt = hasText(b.alt) ? trim(b.alt) : "Award badge";
        cells.push('<td valign="middle" style="padding:0 3px;"><img src="' + esc(src) + '" alt="' + esc(alt) +
          '" width="' + w + '" style="display:block;border:0;outline:none;width:' + w + "px;max-width:" + w + 'px;height:auto;"></td>');
      } else if (placeholder && b) {
        // A badge row that's been added but not filled in yet.
        cells.push('<td valign="middle" style="padding:0 3px;"><img src="' + placeholderSrc(w, w, "Badge", true) +
          '" alt="" width="' + w + '" data-placeholder="badge" style="display:block;border:0;"></td>');
      }
    });
    if (!cells.length && placeholder && opts.badgeHolders) {
      for (var i = 0; i < 2; i++) {
        cells.push('<td valign="middle" style="padding:0 3px;"><img src="' + placeholderSrc(BADGE_DEFAULT, BADGE_DEFAULT, "Badge", true) +
          '" alt="" width="' + BADGE_DEFAULT + '" data-placeholder="badge" style="display:block;border:0;"></td>');
      }
    }
    if (!cells.length) return "";
    return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>' +
      cells.join("") + "</tr></table>";
  }

  // Where the badge row sits across the signature: 0 = left, 100 = right.
  // Uses the style's default until the person moves it.
  function badgePosition(d, styleDefault) {
    var p = parseFloat(d.badgePosition);
    return isNaN(p) ? styleDefault : Math.max(0, Math.min(100, p));
  }

  // Left, centre and right use plain cell alignment. Anything in between uses
  // two empty cells either side whose percentage widths split the free space.
  function badgesRow(d, colspan, styleDefault, paddingTop) {
    var badges = badgesHtml(d, opts.preview);
    if (!badges) return "";
    var cs = colspan > 1 ? ' colspan="' + colspan + '"' : "";
    var pad = "padding-top:" + (paddingTop == null ? 12 : paddingTop) + "px;";
    var pos = Math.round(badgePosition(d, styleDefault || 0));
    var align = { 0: "left", 50: "center", 100: "right" }[pos];
    if (align) return "<tr><td" + cs + ' align="' + align + '" style="' + pad + '">' + badges + "</td></tr>";
    var gap = function (w) { return '<td width="' + w + '%" style="width:' + w + '%;font-size:1px;line-height:1px;">&nbsp;</td>'; };
    return "<tr><td" + cs + ' style="' + pad + '">' +
      '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;"><tr>' +
      gap(pos) + '<td style="white-space:nowrap;">' + badges + "</td>" + gap(100 - pos) +
      "</tr></table></td></tr>";
  }

  // Footer text is escaped, then **double asterisks** become bold.
  function footerText(d) {
    return esc(trim(d.footerText))
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\r?\n/g, "<br>");
  }

  // Shared footer: either small text or a solid coloured bar.
  function footerRow(d, colspan, align, size) {
    if (!hasText(d.footerText)) return "";
    var text = footerText(d);
    var cs = colspan > 1 ? ' colspan="' + colspan + '"' : "";
    var al = align || "left";
    var fs = size || 10;
    var family = fnt(d, "footer");
    if (d.footerStyle === "bar") {
      var bg = col(d, "footerBg");
      return '<tr><td' + cs + ' style="padding-top:12px;">' +
        '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;">' +
        '<tr><td align="' + al + '" bgcolor="' + bg + '" style="background-color:' + bg +
        ";padding:10px 12px;text-align:" + al + ";font-family:" + family + ";" + ts(d, "footer", fs, "1.5") + "color:" +
        col(d, "footerText") + ';">' + text + "</td></tr></table></td></tr>";
    }
    return '<tr><td' + cs + ' align="' + al + '" style="padding-top:12px;text-align:' + al + ";font-family:" + family +
      ";" + ts(d, "footer", fs, "1.5") + "color:" + col(d, "fineprint") + ';">' + text + "</td></tr>";
  }

  function nameHtml(d, size, lineHeight) {
    return '<span style="font-family:' + fnt(d, "name") + ";" + ts(d, "name", size, lineHeight || "1.25") +
      "font-weight:bold;color:" + col(d, "name") + ';">' + esc(trim(d.name) || "Your Name") + "</span>";
  }

  function titleText(d, joiner, withCompany) {
    var bits = [];
    if (hasText(d.jobTitle)) bits.push(esc(trim(d.jobTitle)));
    if (withCompany !== false && hasText(d.company)) bits.push(esc(trim(d.company)));
    return bits.join(joiner);
  }

  function titleHtml(d, size, joiner, color, withCompany) {
    var t = titleText(d, joiner, withCompany);
    if (!t) return "";
    return '<span style="font-family:' + fnt(d, "title") + ";" + ts(d, "title", size, "1.5") + "color:" +
      (color || col(d, "title")) + ';">' + t + "</span>";
  }

  function table(d, inner, width) {
    return '<table cellpadding="0" cellspacing="0" border="0" role="presentation"' +
      (width ? ' width="' + width + '"' : "") +
      ' style="border-collapse:collapse;font-family:' + fnt(d, "body") + ";color:" + col(d, "text") + ';">' +
      inner + "</table>";
  }

  function td(d, style, content) {
    return '<td style="font-family:' + fnt(d, "body") + ";" + style + '">' + content + "</td>";
  }

  /* ---------- Templates ---------- */

  // Logo on the left, a coloured divider, details on the right.
  function classic(d) {
    var logo = logoHtml(d);
    var right = nameHtml(d, 18);
    var tl = titleHtml(d, 13, "&nbsp;&nbsp;|&nbsp;&nbsp;");
    if (tl) right += "<br>" + tl;

    var details = contactItems(d).map(function (c) {
      return '<div style="' + ts(d, "text", 12, "1.6") + '">' + c + "</div>";
    }).join("");
    var addr = addressHtml(d);
    if (addr) details += '<div style="' + ts(d, "address", 12, "1.6") + '">' + addr + "</div>";
    var social = socialHtml(d);
    if (social) details += '<div style="' + ts(d, "social", 12, "1.6") + 'padding-top:6px;">' + social + "</div>";
    if (details) right += spacer(8 + titleGap(d)) + details;

    var divider = col(d, "divider");
    var row = "<tr>";
    if (logo) {
      row += td(d, "vertical-align:middle;padding:0 16px 0 0;", logo);
      row += td(d, "vertical-align:middle;padding:2px 0 2px 16px;border-left:2px solid " + divider + ";", right);
    } else {
      row += td(d, "vertical-align:top;padding:0 0 0 14px;border-left:3px solid " + divider + ";", right);
    }
    row += "</tr>";
    var cols = logo ? 2 : 1;
    return table(d, row + badgesRow(d, cols) + footerRow(d, cols));
  }

  // Name on top, a thin rule, details in a row, logo underneath.
  function stacked(d) {
    var rows = "";
    rows += "<tr>" + td(d, "padding:0;", nameHtml(d, 20)) + "</tr>";
    var tl = titleHtml(d, 13, "&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
    if (tl) rows += "<tr>" + td(d, "padding:2px 0 0 0;", tl) + "</tr>";
    var divider = col(d, "divider");
    rows += '<tr><td style="padding:' + (10 + titleGap(d)) + 'px 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="60" style="border-collapse:collapse;"><tr><td height="2" bgcolor="' +
      divider + '" style="height:2px;line-height:2px;font-size:2px;background-color:' + divider + ';">&nbsp;</td></tr></table></td></tr>';

    var contacts = contactItems(d);
    if (contacts.length) {
      rows += "<tr>" + td(d, "padding:0;" + ts(d, "text", 12, "1.7"),
        contacts.join('&nbsp;&nbsp;<span style="color:' + col(d, "border") + ';">|</span>&nbsp;&nbsp;')) + "</tr>";
    }
    var addr = addressHtml(d);
    if (addr) rows += "<tr>" + td(d, "padding:0;" + ts(d, "address", 12, "1.7"), addr) + "</tr>";
    var social = socialHtml(d);
    if (social) rows += "<tr>" + td(d, "padding:4px 0 0 0;" + ts(d, "social", 12, "1.7"), social) + "</tr>";
    var logo = logoHtml(d);
    if (logo) rows += "<tr>" + td(d, "padding:14px 0 0 0;", logo) + "</tr>";
    return table(d, rows + badgesRow(d, 1) + footerRow(d, 1));
  }

  // Text only. Small, quiet, and works even when images are blocked.
  function minimal(d) {
    var rows = "";
    var head = nameHtml(d, 14, "1.5");
    var tl = titleHtml(d, 13, ", ");
    if (tl) head += '<span style="font-size:13px;color:' + col(d, "title") + ';">&nbsp;&nbsp;&mdash;&nbsp;&nbsp;</span>' + tl;
    rows += "<tr>" + td(d, "padding:0 0 " + titleGap(d) + "px 0;line-height:1.5;", head) + "</tr>";

    var contacts = contactItems(d);
    if (contacts.length) {
      rows += "<tr>" + td(d, "padding:4px 0 0 0;" + ts(d, "text", 12, "1.6"),
        contacts.join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;")) + "</tr>";
    }
    var social = socialHtml(d);
    if (social) rows += "<tr>" + td(d, "padding:2px 0 0 0;" + ts(d, "social", 12, "1.6"), social) + "</tr>";
    return table(d, rows + footerRow(d, 1));
  }

  // A coloured header block holding the name, details beneath.
  function banner(d) {
    var rows = "";
    var headerText = col(d, "headerText");
    var head = '<span style="font-family:' + fnt(d, "name") + ";" + ts(d, "name", 18, "1.3") + "font-weight:bold;color:" +
      headerText + ';">' + esc(trim(d.name) || "Your Name") + "</span>";
    var tl = titleHtml(d, 12, "&nbsp;&nbsp;|&nbsp;&nbsp;", headerText);
    if (tl) head += "<br>" + tl;
    var bg = col(d, "headerBg");
    rows += '<tr><td bgcolor="' + bg + '" style="background-color:' + bg +
      ";padding:12px 16px;font-family:" + fnt(d, "body") + ';">' + head + "</td></tr>";

    var inner = "<tr>";
    var logo = logoHtml(d);
    if (logo) inner += td(d, "vertical-align:middle;padding:0 16px 0 0;", logo);
    var details = contactItems(d).map(function (c) {
      return '<div style="' + ts(d, "text", 12, "1.6") + '">' + c + "</div>";
    }).join("");
    var addr = addressHtml(d);
    if (addr) details += '<div style="' + ts(d, "address", 12, "1.6") + '">' + addr + "</div>";
    var social = socialHtml(d);
    if (social) details += '<div style="' + ts(d, "social", 12, "1.6") + 'padding-top:6px;">' + social + "</div>";
    inner += td(d, "vertical-align:middle;padding:0;", details || "&nbsp;") + "</tr>";

    var border = "1px solid " + col(d, "border");
    rows += '<tr><td style="padding:' + (12 + titleGap(d)) + 'px 16px 12px 16px;border-left:' + border + ";border-right:" + border + ";border-bottom:" + border + ';">' +
      table(d, inner) + "</td></tr>";
    return table(d, rows + badgesRow(d, 1, 100) + footerRow(d, 1), 480);
  }

  // Icon image for the Statement style: the user's own link if given, otherwise
  // the hosted default nearest to the icon colour.
  function iconSrc(d, name) {
    var own = imageUrl(d.icons && d.icons[name]);
    if (own) return own;
    if (!opts.assetBase) return "";
    var hex = S.nearestIconColour(col(d, "icons")).slice(1);
    return opts.assetBase + "icons/" + ICON_VERSION + "/" + name + "-" + hex + ".png";
  }

  // Large serif name; logo, address and contacts in columns split by thin rules;
  // badges on the right and a centred footer.
  function statement(d) {
    var rows = "";
    var head = nameHtml(d, 26, "30px");
    // The logo stands in for the company name; show the name only when there's no logo.
    var tl = titleText(d, "&nbsp;&nbsp;|&nbsp;&nbsp;", !imageUrl(d.logoUrl));
    if (tl) {
      head += '<br><span style="font-family:' + fnt(d, "title") + ";" + ts(d, "title", 16, "22px") + "color:" +
        col(d, "title") + ';">' + tl + "</span>";
    }
    rows += "<tr>" + td(d, "padding:0 0 " + (12 + titleGap(d)) + "px 0;", head) + "</tr>";

    var dividerColour = col(d, "divider");
    var divider = '<td width="2" bgcolor="' + dividerColour + '" style="width:2px;background-color:' +
      dividerColour + ';font-size:0;line-height:0;">&nbsp;</td>';
    // Columns: logo | address | contacts. Any can be missing; dividers go between those present.
    var cols = [];
    var logo = logoHtml(d, opts.preview);
    if (logo) cols.push({ style: "", html: logo });
    if (hasText(d.address)) {
      cols.push({ style: ts(d, "address", 14, "20px") + "white-space:nowrap;", html: addressHtml(d, true) });
    }

    var text = col(d, "text");
    var contacts = [];
    if (webUrl(d.website)) contacts.push(["web", link(webUrl(d.website), displayUrl(d.website), text)]);
    if (hasText(d.phone)) contacts.push(["phone", link(telUrl(d.phone), trim(d.phone), text)]);
    if (hasText(d.mobile)) contacts.push(["phone", link(telUrl(d.mobile), trim(d.mobile), text)]);
    if (hasText(d.email)) contacts.push(["email", link("mailto:" + trim(d.email), trim(d.email), text)]);
    var social = socialHtml(d, "&nbsp;&nbsp;&middot;&nbsp;&nbsp;", false);
    if (social) contacts.push(["social", social]);

    var contactRows = contacts.map(function (c, i) {
      var pad = i < contacts.length - 1 ? 6 : 0;
      var src = iconSrc(d, c[0]);
      var icon = src ? '<td valign="middle" style="padding:0 8px ' + pad + 'px 0;"><img src="' + esc(src) +
        '" width="20" height="20" alt="" style="display:block;border:0;outline:none;width:20px;height:20px;"></td>' : "";
      return "<tr>" + icon + td(d, "vertical-align:middle;padding:0 0 " + pad + "px 0;" +
        ts(d, c[0] === "social" ? "social" : "text", 14, "20px") + "white-space:nowrap;", c[1]) + "</tr>";
    }).join("");
    if (contactRows) {
      cols.push({
        style: "",
        html: '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">' + contactRows + "</table>"
      });
    }
    if (cols.length) {
      var cells = cols.map(function (c, i) {
        var left = i > 0 ? 18 : 0;
        var right = i < cols.length - 1 ? 18 : 0;
        return td(d, "vertical-align:middle;padding:0 " + right + "px 0 " + left + "px;" + c.style, c.html);
      });
      rows += '<tr><td style="padding:0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>' +
        cells.join(divider) + "</tr></table></td></tr>";
    }
    return table(d, rows + badgesRow(d, 1, 100, 10) + footerRow(d, 1, "center", 11));
  }

  // roles: the colour roles each style uses (footer roles are added by the editor).
  var TEMPLATES = [
    // badgePosition: where the style puts the badge row (0 left … 100 right).
    { id: "classic", name: "Classic", description: "Logo beside your details", render: classic, badgePosition: 0,
      roles: ["name", "title", "divider", "label", "text", "address", "social", "freeText"] },
    { id: "stacked", name: "Stacked", description: "Name first, logo below", render: stacked, badgePosition: 0,
      roles: ["name", "title", "divider", "label", "text", "border", "address", "social", "freeText"] },
    { id: "banner", name: "Banner", description: "Bold coloured header", render: banner, badgePosition: 100,
      roles: ["headerBg", "headerText", "label", "text", "address", "social", "freeText", "border"] },
    { id: "statement", name: "Statement", description: "Big serif name, columns", render: statement, badgePosition: 100,
      roles: ["name", "title", "divider", "address", "icons", "text", "social", "freeText"],
      nameFont: "georgia", badgeHolders: true, icons: true },
    { id: "minimal", name: "Minimal", description: "Text only, no images", render: minimal,
      roles: ["name", "title", "label", "text", "social", "freeText"], noImages: true }
  ];

  function find(templateId) {
    return TEMPLATES.filter(function (x) { return x.id === templateId; })[0] || TEMPLATES[0];
  }

  // data must carry resolved role colours in data.colors (see app.js).
  function render(templateId, data, options) {
    var t = find(templateId);
    opts = Object.assign({ nameFont: t.nameFont, badgeHolders: t.badgeHolders }, options || {});
    try {
      return t.render(data);
    } finally {
      opts = {};
    }
  }

  // Plain-text version, used for the text/plain clipboard flavour.
  function renderText(d) {
    var lines = [trim(d.name) || "Your Name"];
    var tl = [trim(d.jobTitle), trim(d.company)].filter(Boolean).join(", ");
    if (tl) lines.push(tl);
    if (hasText(d.phone)) lines.push("T " + trim(d.phone));
    if (hasText(d.mobile)) lines.push("M " + trim(d.mobile));
    if (hasText(d.email)) lines.push("E " + trim(d.email));
    if (webUrl(d.website)) lines.push("W " + displayUrl(d.website));
    if (hasText(d.address)) lines.push(trim(d.address).replace(/\r?\n/g, ", "));
    if (hasText(d.socialText)) {
      var url = webUrl(d.socialTextUrl);
      lines.push(trim(d.socialText) + (url ? " " + displayUrl(url) : ""));
    }
    if (hasText(d.footerText)) lines.push("", trim(d.footerText).replace(/\*\*/g, ""));
    return lines.join("\n");
  }

  S.templates = TEMPLATES;
  S.findTemplate = find;
  S.fonts = FONTS;
  S.fontRoles = FONT_ROLES;
  S.spacingRoles = SPACING_ROLES;
  S.socials = SOCIALS;
  S.iconNames = ["web", "phone", "email", "social"];
  S.badge = { min: BADGE_MIN, max: BADGE_MAX, default: BADGE_DEFAULT };
  S.render = render;
  S.renderText = renderText;
  S.esc = esc;
})();
