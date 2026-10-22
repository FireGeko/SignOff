/*
 * SignOff signature templates.
 *
 * Every template returns a string of email-safe HTML:
 *   - table layout only, all styles inline (no <style>, no classes, no flexbox/grid)
 *   - system fonts only (web fonts are ignored by most mail clients)
 *   - images by public HTTPS URL only (base64 / data: images are blocked by most clients)
 *   - every image has alt text and a width attribute
 * All user text goes through esc() before it touches the markup.
 */
(function () {
  "use strict";

  var FONTS = {
    arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
    helvetica: { label: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
    verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
    tahoma: { label: "Tahoma", stack: "Tahoma, Verdana, sans-serif" },
    trebuchet: { label: "Trebuchet MS", stack: "'Trebuchet MS', Arial, sans-serif" },
    georgia: { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
    times: { label: "Times New Roman", stack: "'Times New Roman', Times, serif" }
  };

  var SOCIALS = [
    { key: "linkedin", label: "LinkedIn" },
    { key: "instagram", label: "Instagram" },
    { key: "facebook", label: "Facebook" },
    { key: "x", label: "X" },
    { key: "tiktok", label: "TikTok" },
    { key: "youtube", label: "YouTube" },
    { key: "bluesky", label: "Bluesky" }
  ];

  var TEXT = "#2b2b2b";
  var MUTED = "#6b6b6b";

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

  function font(d) {
    return (FONTS[d.font] || FONTS.arial).stack;
  }

  function link(href, text, color, bold) {
    return '<a href="' + esc(href) + '" style="color:' + color + ";text-decoration:none;" +
      (bold ? "font-weight:bold;" : "") + '">' + esc(text) + "</a>";
  }

  // Contact details as a list of small HTML fragments.
  function contactItems(d) {
    var items = [];
    var label = function (t) {
      return '<span style="color:' + d.brandColor + ';font-weight:bold;">' + t + "</span>&nbsp;";
    };
    if (hasText(d.phone)) items.push(label("T") + link(telUrl(d.phone), trim(d.phone), TEXT));
    if (hasText(d.mobile)) items.push(label("M") + link(telUrl(d.mobile), trim(d.mobile), TEXT));
    if (hasText(d.email)) items.push(label("E") + link("mailto:" + trim(d.email), trim(d.email), TEXT));
    if (webUrl(d.website)) items.push(label("W") + link(webUrl(d.website), displayUrl(d.website), TEXT));
    return items;
  }

  function addressHtml(d) {
    if (!hasText(d.address)) return "";
    return esc(trim(d.address)).replace(/\r?\n/g, ", ");
  }

  function socialHtml(d, separator) {
    var parts = [];
    SOCIALS.forEach(function (s) {
      var url = webUrl(d.social && d.social[s.key]);
      if (url) parts.push(link(url, s.label, d.brandColor, true));
    });
    return parts.join(separator || "&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
  }

  function logoHtml(d) {
    var src = imageUrl(d.logoUrl);
    if (!src) return "";
    var w = Math.max(40, Math.min(300, parseInt(d.logoWidth, 10) || 120));
    var alt = hasText(d.company) ? trim(d.company) : "Logo";
    var img = '<img src="' + esc(src) + '" alt="' + esc(alt) + '" width="' + w + '" ' +
      'style="display:block;border:0;outline:none;width:' + w + "px;max-width:" + w + 'px;height:auto;">';
    var href = webUrl(d.website);
    return href ? '<a href="' + esc(href) + '" style="text-decoration:none;">' + img + "</a>" : img;
  }

  function nameHtml(d, size) {
    return '<span style="font-size:' + size + "px;line-height:1.25;font-weight:bold;color:" +
      d.brandColor + ';">' + esc(trim(d.name) || "Your Name") + "</span>";
  }

  function titleLine(d, joiner) {
    var bits = [];
    if (hasText(d.jobTitle)) bits.push(esc(trim(d.jobTitle)));
    if (hasText(d.company)) bits.push(esc(trim(d.company)));
    return bits.join(joiner);
  }

  // Award / accreditation badges, in a single row.
  function badgesHtml(d) {
    var cells = [];
    (d.badges || []).forEach(function (b) {
      var src = imageUrl(b && b.url);
      if (!src) return;
      var alt = hasText(b.alt) ? trim(b.alt) : "Award badge";
      cells.push('<td style="padding:0 0 0 6px;"><img src="' + esc(src) + '" alt="' + esc(alt) +
        '" width="64" style="display:block;border:0;outline:none;width:64px;max-width:64px;height:auto;"></td>');
    });
    if (!cells.length) return "";
    return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>' +
      cells.join("") + "</tr></table>";
  }

  function badgesRow(d, colspan, align) {
    var badges = badgesHtml(d);
    if (!badges) return "";
    var cs = colspan > 1 ? ' colspan="' + colspan + '"' : "";
    return "<tr><td" + cs + ' align="' + (align || "left") + '" style="padding-top:12px;">' + badges + "</td></tr>";
  }

  // Shared footer: either small grey text or a solid brand-coloured bar.
  function footerRow(d, colspan, align) {
    if (!hasText(d.footerText)) return "";
    var text = esc(trim(d.footerText)).replace(/\r?\n/g, "<br>");
    var cs = colspan > 1 ? ' colspan="' + colspan + '"' : "";
    var al = align || "left";
    if (d.footerStyle === "bar") {
      return '<tr><td' + cs + ' style="padding-top:14px;">' +
        '<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;">' +
        '<tr><td align="' + al + '" bgcolor="' + d.brandColor + '" style="background-color:' + d.brandColor +
        ";padding:8px 12px;text-align:" + al + ";font-family:" + font(d) + ';font-size:10px;line-height:1.5;color:#ffffff;">' +
        text + "</td></tr></table></td></tr>";
    }
    return '<tr><td' + cs + ' align="' + al + '" style="padding-top:12px;text-align:' + al + ";font-family:" + font(d) +
      ";font-size:10px;line-height:1.5;color:" + MUTED + ';">' + text + "</td></tr>";
  }

  function table(d, inner, width) {
    return '<table cellpadding="0" cellspacing="0" border="0" role="presentation"' +
      (width ? ' width="' + width + '"' : "") +
      ' style="border-collapse:collapse;font-family:' + font(d) + ";color:" + TEXT + ';">' +
      inner + "</table>";
  }

  function td(d, style, content) {
    return '<td style="font-family:' + font(d) + ";" + style + '">' + content + "</td>";
  }

  /* ---------- Templates ---------- */

  // Logo on the left, a coloured divider, details on the right.
  function classic(d) {
    var logo = logoHtml(d);
    var lines = [nameHtml(d, 18)];
    var tl = titleLine(d, "&nbsp;&nbsp;|&nbsp;&nbsp;");
    if (tl) lines.push('<span style="font-size:13px;color:' + MUTED + ';">' + tl + "</span>");

    var details = contactItems(d).map(function (c) {
      return '<div style="font-size:12px;line-height:1.6;">' + c + "</div>";
    }).join("");
    var addr = addressHtml(d);
    if (addr) details += '<div style="font-size:12px;line-height:1.6;color:' + MUTED + ';">' + addr + "</div>";
    var social = socialHtml(d);
    if (social) details += '<div style="font-size:12px;line-height:1.6;padding-top:6px;">' + social + "</div>";

    var right = lines.join("<br>") +
      (details ? '<div style="padding-top:8px;">' + details + "</div>" : "");

    var row = "<tr>";
    if (logo) {
      row += td(d, "vertical-align:middle;padding:0 16px 0 0;", logo);
      row += td(d, "vertical-align:middle;padding:2px 0 2px 16px;border-left:2px solid " + d.brandColor + ";", right);
    } else {
      row += td(d, "vertical-align:top;padding:0 0 0 14px;border-left:3px solid " + d.brandColor + ";", right);
    }
    row += "</tr>";
    var cols = logo ? 2 : 1;
    return table(d, row + badgesRow(d, cols) + footerRow(d, cols));
  }

  // Name on top, a thin rule, details in a row, logo underneath.
  function stacked(d) {
    var rows = "";
    rows += "<tr>" + td(d, "padding:0;", nameHtml(d, 20)) + "</tr>";
    var tl = titleLine(d, "&nbsp;&nbsp;&middot;&nbsp;&nbsp;");
    if (tl) rows += "<tr>" + td(d, "padding:2px 0 0 0;font-size:13px;color:" + MUTED + ";", tl) + "</tr>";
    rows += '<tr><td style="padding:10px 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="60" style="border-collapse:collapse;"><tr><td height="2" bgcolor="' +
      d.brandColor + '" style="height:2px;line-height:2px;font-size:2px;background-color:' + d.brandColor + ';">&nbsp;</td></tr></table></td></tr>';

    var contacts = contactItems(d);
    if (contacts.length) {
      rows += "<tr>" + td(d, "padding:0;font-size:12px;line-height:1.7;",
        contacts.join('&nbsp;&nbsp;<span style="color:#c4c4c4;">|</span>&nbsp;&nbsp;')) + "</tr>";
    }
    var addr = addressHtml(d);
    if (addr) rows += "<tr>" + td(d, "padding:0;font-size:12px;line-height:1.7;color:" + MUTED + ";", addr) + "</tr>";
    var social = socialHtml(d);
    if (social) rows += "<tr>" + td(d, "padding:4px 0 0 0;font-size:12px;line-height:1.7;", social) + "</tr>";
    var logo = logoHtml(d);
    if (logo) rows += "<tr>" + td(d, "padding:14px 0 0 0;", logo) + "</tr>";
    return table(d, rows + badgesRow(d, 1) + footerRow(d, 1));
  }

  // Text only. Small, quiet, and works even when images are blocked.
  function minimal(d) {
    var rows = "";
    var head = '<span style="font-size:14px;font-weight:bold;color:' + TEXT + ';">' +
      esc(trim(d.name) || "Your Name") + "</span>";
    var tl = titleLine(d, ", ");
    if (tl) head += '<span style="font-size:13px;color:' + MUTED + ';">&nbsp;&nbsp;&mdash;&nbsp;&nbsp;' + tl + "</span>";
    rows += "<tr>" + td(d, "padding:0;line-height:1.5;", head) + "</tr>";

    var contacts = contactItems(d);
    if (contacts.length) {
      rows += "<tr>" + td(d, "padding:4px 0 0 0;font-size:12px;line-height:1.6;",
        contacts.join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;")) + "</tr>";
    }
    var social = socialHtml(d);
    if (social) rows += "<tr>" + td(d, "padding:2px 0 0 0;font-size:12px;line-height:1.6;", social) + "</tr>";
    return table(d, rows + footerRow(d, 1));
  }

  // A brand-coloured header block holding the name, details beneath.
  function banner(d) {
    var rows = "";
    var head = '<span style="font-size:18px;line-height:1.3;font-weight:bold;color:#ffffff;">' +
      esc(trim(d.name) || "Your Name") + "</span>";
    var tl = titleLine(d, "&nbsp;&nbsp;|&nbsp;&nbsp;");
    if (tl) head += '<br><span style="font-size:12px;line-height:1.5;color:#ffffff;">' + tl + "</span>";
    rows += '<tr><td bgcolor="' + d.brandColor + '" style="background-color:' + d.brandColor +
      ";padding:12px 16px;font-family:" + font(d) + ';">' + head + "</td></tr>";

    var inner = "<tr>";
    var logo = logoHtml(d);
    if (logo) inner += td(d, "vertical-align:middle;padding:0 16px 0 0;", logo);
    var details = contactItems(d).map(function (c) {
      return '<div style="font-size:12px;line-height:1.6;">' + c + "</div>";
    }).join("");
    var addr = addressHtml(d);
    if (addr) details += '<div style="font-size:12px;line-height:1.6;color:' + MUTED + ';">' + addr + "</div>";
    var social = socialHtml(d);
    if (social) details += '<div style="font-size:12px;line-height:1.6;padding-top:6px;">' + social + "</div>";
    inner += td(d, "vertical-align:middle;padding:0;", details || "&nbsp;") + "</tr>";

    rows += '<tr><td style="padding:12px 16px 0 16px;border-left:1px solid #e3e3e3;border-right:1px solid #e3e3e3;border-bottom:1px solid #e3e3e3;padding-bottom:12px;">' +
      table(d, inner) + "</td></tr>";
    return table(d, rows + badgesRow(d, 1, "right") + footerRow(d, 1), 480);
  }

  // Large serif name; logo, address and contacts in columns split by thin rules;
  // badges on the right and a centred footer.
  function statement(d) {
    var serif = FONTS.georgia.stack;
    var rows = "";
    var head = '<span style="font-family:' + serif + ";font-size:26px;line-height:30px;font-weight:bold;color:" +
      d.brandColor + ';">' + esc(trim(d.name) || "Your Name") + "</span>";
    var tl = titleLine(d, "&nbsp;&nbsp;|&nbsp;&nbsp;");
    if (tl) head += '<br><span style="font-size:16px;line-height:22px;color:' + d.brandColor + ';">' + tl + "</span>";
    rows += "<tr>" + td(d, "padding:0 0 12px 0;", head) + "</tr>";

    var divider = '<td width="2" bgcolor="' + d.brandColor + '" style="width:2px;background-color:' +
      d.brandColor + ';font-size:0;line-height:0;">&nbsp;</td>';
    // Columns: logo | address | contacts. Any can be missing; dividers go between those present.
    var cols = [];
    var logo = logoHtml(d);
    if (logo) cols.push({ style: "", html: logo });
    if (hasText(d.address)) {
      cols.push({
        style: "font-size:14px;line-height:20px;white-space:nowrap;color:" + d.brandColor + ";",
        html: esc(trim(d.address)).replace(/\r?\n/g, "<br>")
      });
    }
    var contactRows = contactItems(d).map(function (c) {
      return "<tr>" + td(d, "padding:0 0 4px 0;font-size:14px;line-height:20px;white-space:nowrap;", c) + "</tr>";
    }).join("");
    var social = socialHtml(d);
    if (social) contactRows += "<tr>" + td(d, "padding:2px 0 0 0;font-size:14px;line-height:20px;", social) + "</tr>";
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
    return table(d, rows + badgesRow(d, 1, "right") + footerRow(d, 1, "center"));
  }

  var TEMPLATES = [
    { id: "classic", name: "Classic", description: "Logo beside your details", render: classic },
    { id: "stacked", name: "Stacked", description: "Name first, logo below", render: stacked },
    { id: "banner", name: "Banner", description: "Bold coloured header", render: banner },
    { id: "statement", name: "Statement", description: "Big serif name, columns", render: statement },
    { id: "minimal", name: "Minimal", description: "Text only, no images", render: minimal }
  ];

  function render(templateId, data) {
    var t = TEMPLATES.filter(function (x) { return x.id === templateId; })[0] || TEMPLATES[0];
    return t.render(data);
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
    if (hasText(d.footerText)) lines.push("", trim(d.footerText));
    return lines.join("\n");
  }

  window.SignOff = window.SignOff || {};
  window.SignOff.templates = TEMPLATES;
  window.SignOff.fonts = FONTS;
  window.SignOff.socials = SOCIALS;
  window.SignOff.render = render;
  window.SignOff.renderText = renderText;
  window.SignOff.esc = esc;
})();
