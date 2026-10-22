/*
 * SignOff importer.
 *
 * Turns a signature made elsewhere (an HTML file, an Outlook signature file, or
 * a signature pasted from an email) into a "custom style": the original layout,
 * cleaned up, with every piece of text, link, image, colour and font editable.
 *
 * Imported HTML is untrusted. It is parsed inertly, then rebuilt from an
 * allowlist of tags, attributes and CSS properties before it ever reaches the
 * page. Scripts, forms, event handlers and unsafe URLs never survive.
 */
(function () {
  "use strict";

  var S = window.SignOff;

  var MAX_BYTES = 2 * 1024 * 1024;
  var MARKER = /<!--\s*signoff-settings:([A-Za-z0-9+/=]+)\s*-->/;

  // Removed together with everything inside them.
  var DROP = ["script", "style", "link", "meta", "title", "base", "iframe", "frame", "frameset", "object",
    "embed", "applet", "form", "input", "button", "select", "option", "textarea", "svg", "math",
    "noscript", "template", "video", "audio", "source", "track", "canvas", "head", "xml"];

  // Kept. Any other tag is replaced by its contents (Word's <o:p>, <font>-like oddities, etc.).
  var KEEP = ["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col", "p", "div",
    "span", "a", "img", "br", "hr", "b", "strong", "i", "em", "u", "s", "strike", "font", "center", "small",
    "big", "sup", "sub", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code"];

  var ATTRS = ["style", "href", "src", "alt", "title", "width", "height", "align", "valign", "bgcolor", "color",
    "face", "size", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "role", "dir", "target"];

  var CSS_EXACT = ["color", "background-color", "font-family", "font-size", "font-weight", "font-style",
    "text-align", "text-transform", "text-indent", "line-height", "letter-spacing", "word-spacing", "white-space",
    "vertical-align", "width", "height", "max-width", "min-width", "max-height", "min-height", "display",
    "direction", "border-collapse", "border-spacing", "text-decoration-line", "text-decoration-color",
    "text-decoration-style"];
  var CSS_PREFIX = ["padding-", "margin-", "border-top-", "border-right-", "border-bottom-", "border-left-"];
  var DISPLAY_OK = ["block", "inline", "inline-block", "none", "table", "table-row", "table-cell"];
  var COLOUR_PROPS = /(^|-)color$/;

  /* ---------- Colours ---------- */

  var colourCtx = null;

  function toHex(value) {
    var v = String(value || "").trim();
    if (!v) return "";
    var m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(v);
    if (m) {
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return "transparent";
      return "#" + [m[1], m[2], m[3]].map(function (n) {
        return ("0" + Math.min(255, parseInt(n, 10)).toString(16)).slice(-2);
      }).join("");
    }
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    if (/^transparent$/i.test(v)) return "transparent";
    // Named colours: let the browser resolve them. A canvas ignores values it
    // doesn't understand, so start from a sentinel to spot those.
    if (!colourCtx) colourCtx = document.createElement("canvas").getContext("2d");
    colourCtx.fillStyle = "#010203";
    colourCtx.fillStyle = v;
    var out = colourCtx.fillStyle;
    if (out === "#010203" && v.toLowerCase() !== "#010203") return "";
    return /^#[0-9a-f]{6}$/i.test(out) ? out : "";
  }

  /* ---------- CSS cleaning ---------- */

  var scratch = document.createElement("div");

  function cssAllowed(name) {
    if (CSS_EXACT.indexOf(name) >= 0) return true;
    return CSS_PREFIX.some(function (p) { return name.indexOf(p) === 0; });
  }

  // Rebuilds a style attribute from allowed properties only, colours as hex.
  function cleanStyle(value) {
    scratch.removeAttribute("style");
    scratch.style.cssText = String(value || "");
    var out = [];
    for (var i = 0; i < scratch.style.length; i++) {
      var name = scratch.style[i];
      if (!cssAllowed(name)) continue;
      var v = scratch.style.getPropertyValue(name).trim();
      if (!v || v === "initial" || /url\(|expression|javascript:|behavior/i.test(v)) continue;
      if (name === "display" && DISPLAY_OK.indexOf(v) < 0) continue;
      if (COLOUR_PROPS.test(name)) {
        v = toHex(v);
        if (!v || (v === "transparent" && name === "background-color")) continue;
      }
      out.push(name + ":" + v);
    }
    return out.join(";");
  }

  /* ---------- URLs ---------- */

  function safeHref(v) {
    v = String(v || "").trim();
    return /^(https?:|mailto:|tel:)/i.test(v) ? v : "";
  }

  // Images are kept even when they won't work in email (so people can see and
  // replace them), but never with a scripting scheme.
  function safeSrc(v) {
    v = String(v || "").trim();
    if (/^(javascript|vbscript):/i.test(v)) return "";
    if (/^[a-z][a-z0-9+.\-]*:/i.test(v) && !/^(https?:|data:image\/|cid:)/i.test(v)) return "";
    return v;
  }

  // Why an image won't show in a sent email, or "" if it's fine.
  function imageProblem(src) {
    var v = String(src || "").trim();
    if (!v) return "No image link.";
    if (/^https:\/\//i.test(v)) return "";
    if (/^http:\/\//i.test(v)) return "Uses http://. Email apps need a secure https:// link.";
    if (/^data:/i.test(v)) return "Embedded in the file. Most email apps block these, so replace it with a web link.";
    if (/^cid:/i.test(v)) return "Attached to the original email, so it can't be reused. Replace it with a web link.";
    return "Points to a file on a computer, not the web. Replace it with a web link.";
  }

  function needsLinkSrc(w, h) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' +
      '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="6" fill="#fff6e0" stroke="#d9a400" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, sans-serif" font-size="' +
      Math.max(8, Math.min(12, Math.round(w / 10))) + '" fill="#8a6100">Needs a web link</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- Sanitising ---------- */

  function stripDangerous(root) {
    DROP.forEach(function (tag) {
      if (tag === "style" || tag === "head") return; // still needed to work out styles
      Array.prototype.slice.call(root.querySelectorAll(tag)).forEach(function (n) { n.remove(); });
    });
    Array.prototype.slice.call(root.querySelectorAll("*")).forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || /^\s*(javascript|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
      });
    });
  }

  // Rebuilds a node tree into `out` (a fresh element) from the allowlists.
  function rebuild(node, out, doc) {
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) {
        out.appendChild(doc.createTextNode(child.nodeValue));
        return;
      }
      if (child.nodeType !== 1) return; // comments, processing instructions
      var tag = child.localName.toLowerCase();
      if (DROP.indexOf(tag) >= 0) return;
      if (KEEP.indexOf(tag) < 0) {
        rebuild(child, out, doc); // unwrap
        return;
      }
      var el = doc.createElement(tag);
      ATTRS.forEach(function (name) {
        if (!child.hasAttribute(name)) return;
        var v = child.getAttribute(name);
        if (name === "style") v = cleanStyle(v);
        else if (name === "href") v = safeHref(v);
        else if (name === "src") v = safeSrc(v);
        else if (name === "bgcolor" || name === "color") v = toHex(v);
        else if (name === "target") v = v === "_blank" ? v : "";
        if (v) el.setAttribute(name, v);
      });
      rebuild(child, el, doc);
      out.appendChild(el);
    });
  }

  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html || ""), "text/html");
    var out = doc.createElement("div");
    rebuild(doc.body, out, doc);
    return out.innerHTML.trim();
  }

  /* ---------- Style sheets to inline styles ---------- */

  var INHERITED = ["color", "font-family", "font-size", "font-weight", "font-style", "line-height",
    "letter-spacing", "text-align"];
  var BOX = ["margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left"];
  var RESET_MARGINS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote"];

  // Outlook and Word signatures style text through a <style> sheet, which email
  // apps throw away. Render the document invisibly (no scripts can run), read
  // the final styles, and write them onto each element.
  function inlineStyles(doc) {
    return new Promise(function (resolve) {
      var frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden;";
      var done = false;
      frame.onload = function () {
        if (done) return;
        done = true;
        var fdoc = frame.contentDocument;
        var win = frame.contentWindow;
        var body = fdoc.body;
        var all = [body].concat(Array.prototype.slice.call(body.querySelectorAll("*")));
        var computed = all.map(function (el) { return win.getComputedStyle(el); });
        var styleOf = new Map();
        all.forEach(function (el, i) { styleOf.set(el, computed[i]); });

        var updates = all.map(function (el, i) {
          var cs = computed[i];
          var parent = el === body ? null : styleOf.get(el.parentElement);
          var decl = [];
          INHERITED.forEach(function (p) {
            var v = cs.getPropertyValue(p);
            if (!parent || v !== parent.getPropertyValue(p)) decl.push(p + ":" + v);
          });
          var tag = el.localName;
          BOX.forEach(function (p) {
            var v = cs.getPropertyValue(p);
            if (v !== "0px" || RESET_MARGINS.indexOf(tag) >= 0 && p.indexOf("margin") === 0) decl.push(p + ":" + v);
          });
          var bg = cs.getPropertyValue("background-color");
          if (toHex(bg) && toHex(bg) !== "transparent") decl.push("background-color:" + bg);
          var deco = cs.getPropertyValue("text-decoration-line");
          if (tag === "a" || (parent && deco !== parent.getPropertyValue("text-decoration-line"))) {
            decl.push("text-decoration-line:" + deco);
          }
          ["top", "right", "bottom", "left"].forEach(function (side) {
            var st = cs.getPropertyValue("border-" + side + "-style");
            if (st && st !== "none") {
              decl.push("border-" + side + "-style:" + st);
              decl.push("border-" + side + "-width:" + cs.getPropertyValue("border-" + side + "-width"));
              decl.push("border-" + side + "-color:" + cs.getPropertyValue("border-" + side + "-color"));
            }
          });
          return decl;
        });

        all.forEach(function (el, i) {
          if (el === body) return;
          var own = el.getAttribute("style") || "";
          el.setAttribute("style", updates[i].join(";") + (own ? ";" + own : ""));
          el.removeAttribute("class");
        });
        // The body's own text styles move onto a wrapper, since only its contents
        // are kept. Browser defaults (Times New Roman, black) are left out so they
        // don't override the recipient's email app.
        var probe = fdoc.createElement("signoff-probe");
        fdoc.documentElement.appendChild(probe);
        var defaults = win.getComputedStyle(probe);
        var bodyStyle = INHERITED.filter(function (p) {
          return computed[0].getPropertyValue(p) !== defaults.getPropertyValue(p);
        }).map(function (p) { return p + ":" + computed[0].getPropertyValue(p); });
        probe.remove();
        var wrapper = fdoc.createElement("div");
        if (bodyStyle.length) wrapper.setAttribute("style", bodyStyle.join(";"));
        while (body.firstChild) wrapper.appendChild(body.firstChild);
        var html = wrapper.outerHTML;
        frame.remove();
        resolve(html);
      };
      // Content first: attaching an empty frame fires a load event for about:blank.
      frame.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
      document.body.appendChild(frame);
    });
  }

  /* ---------- Finding the editable parts ---------- */

  function parse(html) {
    return new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  }

  function textNodes(root) {
    var walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var list = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.replace(/[\s ]+/g, "")) list.push(walker.currentNode);
    }
    return list;
  }

  function firstFamily(value) {
    return String(value || "").split(",")[0].replace(/["']/g, "").trim();
  }

  function eachColour(root, fn) {
    Array.prototype.forEach.call(root.querySelectorAll("*"), function (el) {
      ["bgcolor", "color"].forEach(function (a) {
        if (el.hasAttribute(a)) {
          var r = fn(el.getAttribute(a));
          if (r) el.setAttribute(a, r);
        }
      });
      for (var i = 0; i < el.style.length; i++) {
        var name = el.style[i];
        if (!COLOUR_PROPS.test(name)) continue;
        var r2 = fn(el.style.getPropertyValue(name));
        if (r2) el.style.setProperty(name, r2);
      }
    });
  }

  function eachFont(root, fn) {
    Array.prototype.forEach.call(root.querySelectorAll("*"), function (el) {
      if (el.style.fontFamily) {
        var r = fn(firstFamily(el.style.fontFamily));
        if (r) el.style.fontFamily = r;
      }
      if (el.hasAttribute("face")) {
        var r2 = fn(firstFamily(el.getAttribute("face")));
        if (r2) el.setAttribute("face", r2);
      }
    });
  }

  var partsCache = { html: null, parts: null };

  // The editable pieces of a custom style, in document order.
  function parts(html) {
    if (partsCache.html === html) return partsCache.parts;
    var root = parse(html).body;
    var counts = {};
    eachColour(root, function (c) {
      var hex = toHex(c);
      if (hex && hex !== "transparent") counts[hex] = (counts[hex] || 0) + 1;
    });
    var fonts = [];
    eachFont(root, function (f) {
      if (f && fonts.indexOf(f) < 0) fonts.push(f);
    });
    var result = {
      texts: textNodes(root).map(function (n) { return n.nodeValue.replace(/[\s ]+/g, " ").trim(); }),
      links: Array.prototype.map.call(root.querySelectorAll("a[href]"), function (a) {
        return { href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g, " ").trim() };
      }),
      images: Array.prototype.map.call(root.querySelectorAll("img"), function (img) {
        return {
          src: img.getAttribute("src") || "",
          alt: img.getAttribute("alt") || "",
          width: parseInt(img.getAttribute("width"), 10) || parseInt(img.style.width, 10) || 0
        };
      }),
      colours: Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }),
      fonts: fonts
    };
    partsCache = { html: html, parts: result };
    return result;
  }

  /* ---------- Rendering a custom style ---------- */

  // custom: { html, textEdits, linkEdits, imageEdits, colourSwaps, fontSwaps }
  // options.preview: keep images that won't work in email, so they can be seen and fixed.
  function render(custom, options) {
    var preview = options && options.preview;
    var root = parse(custom.html || "").body;

    var textEdits = custom.textEdits || {};
    textNodes(root).forEach(function (node, i) {
      if (!(i in textEdits)) return;
      var m = /^([\s ]*)[\s\S]*?([\s ]*)$/.exec(node.nodeValue);
      node.nodeValue = m[1] + textEdits[i] + m[2];
    });

    var linkEdits = custom.linkEdits || {};
    Array.prototype.forEach.call(root.querySelectorAll("a[href]"), function (a, i) {
      if (!(i in linkEdits)) return;
      var href = safeHref(linkEdits[i]) || safeHref("https://" + String(linkEdits[i]).replace(/^\/+/, ""));
      if (href && String(linkEdits[i]).trim()) a.setAttribute("href", href);
    });

    var imageEdits = custom.imageEdits || {};
    Array.prototype.slice.call(root.querySelectorAll("img")).forEach(function (img, i) {
      var e = imageEdits[i] || {};
      if (e.src !== undefined && String(e.src).trim()) img.setAttribute("src", safeSrc(e.src));
      if (e.alt !== undefined) img.setAttribute("alt", e.alt);
      var w = parseInt(e.width, 10);
      if (w > 0) {
        img.setAttribute("width", w);
        img.style.width = w + "px";
        img.style.height = "auto";
        img.removeAttribute("height");
      }
      if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
      if (imageProblem(img.getAttribute("src"))) {
        if (!preview) {
          img.remove();
        } else if (!/^data:image\//i.test(img.getAttribute("src"))) {
          // Show where the image goes instead of a broken-image icon.
          img.setAttribute("src", needsLinkSrc(parseInt(img.getAttribute("width"), 10) || 120,
            parseInt(img.getAttribute("height"), 10) || 48));
          img.setAttribute("data-placeholder", "image");
        }
      }
    });

    var swaps = custom.colourSwaps || {};
    if (Object.keys(swaps).length) {
      eachColour(root, function (c) {
        var to = swaps[toHex(c)];
        return to && /^#[0-9a-f]{6}$/i.test(to) ? to : null;
      });
    }

    var fontSwaps = custom.fontSwaps || {};
    if (Object.keys(fontSwaps).length) {
      eachFont(root, function (f) {
        var key = fontSwaps[f];
        return key && S.fonts[key] ? S.fonts[key].stack : null;
      });
    }
    return root.innerHTML;
  }

  /* ---------- Rebuilding a signature as a built-in style ---------- */

  // Social links are recognised by where they point.
  var SOCIAL_HOSTS = [
    ["linkedin", /(^|\.)linkedin\.com$/], ["instagram", /(^|\.)instagram\.com$/],
    ["facebook", /(^|\.)(facebook|fb)\.com$/], ["x", /(^|\.)(x|twitter)\.com$/],
    ["tiktok", /(^|\.)tiktok\.com$/], ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
    ["bluesky", /(^|\.)bsky\.app$/]
  ];

  // The nearest inline value of a CSS property, looking up through ancestors.
  function inherited(el, prop) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var v = n.style && n.style.getPropertyValue(prop);
      if (v) return v;
    }
    return "";
  }

  function px(value) {
    var m = /([\d.]+)\s*(px|pt)?/.exec(value || "");
    if (!m) return 0;
    return m[2] === "pt" ? parseFloat(m[1]) * 4 / 3 : parseFloat(m[1]);
  }

  function hostOf(href) {
    try { return new URL(href).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; }
  }

  function colourOf(el) {
    var c = toHex(inherited(el, "color"));
    return /^#[0-9a-f]{6}$/.test(c) ? c : "";
  }

  // The background a footer bar sits on, if any.
  function barColour(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = toHex(n.style.backgroundColor || n.getAttribute("bgcolor"));
      if (/^#[0-9a-f]{6}$/.test(c)) return { colour: c, el: n };
    }
    return null;
  }

  // Reads a signature's details back out of its HTML so it can be rebuilt in
  // one of SignOff's own styles. Best effort: returns null if it can't find at
  // least a name and one way to get in touch.
  function recognise(html) {
    var root = parse(html).body;
    var nodes = textNodes(root);
    if (!nodes.length) return null;
    var inLink = function (n) { return !!(n.parentElement && n.parentElement.closest("a")); };
    var text = function (n) { return n.nodeValue.replace(/[\s ]+/g, " ").trim(); };
    var size = function (n) { return px(inherited(n.parentElement, "font-size")); };

    // Name: the largest text (the first, if several share the size).
    var nameNode = nodes.reduce(function (best, n) {
      return !inLink(n) && size(n) > (best ? size(best) : 0) ? n : best;
    }, null);
    if (!nameNode) return null;
    var d = { name: text(nameNode), social: {}, badges: [], colors: {} };
    var nameSize = size(nameNode);
    d.colors.name = colourOf(nameNode.parentElement);

    // Header block (Banner style): the name sits on a coloured background.
    var header = barColour(nameNode.parentElement);

    // Footer: text near the end on a coloured bar, or the last small print.
    var after = nodes.slice(nodes.indexOf(nameNode) + 1);
    var footerNodes = [];
    var bar = null;
    for (var i = after.length - 1; i >= 0; i--) {
      var n = after[i];
      var b = barColour(n.parentElement);
      if (b && (!header || b.el !== header.el)) {
        bar = bar || b;
        if (b.el === bar.el) { footerNodes.unshift(n); continue; }
      }
      if (!bar && !inLink(n) && size(n) && size(n) <= 11 && size(n) < nameSize) { footerNodes.unshift(n); continue; }
      break;
    }
    if (footerNodes.length) {
      var holder = footerNodes[0].parentElement.closest("td,p,div") || footerNodes[0].parentElement;
      d.footerText = Array.prototype.map.call(holder.childNodes, function (c) {
        var t = c.textContent.replace(/[\s ]+/g, " ");
        return c.nodeType === 1 && /^(b|strong)$/i.test(c.localName) ? "**" + t.trim() + "** " : t;
      }).join("").replace(/\s+/g, " ").trim();
      d.footerStyle = bar ? "bar" : "text";
      if (bar) d.colors.footerBg = bar.colour;
      if (bar) d.colors.footerText = colourOf(footerNodes[0].parentElement);
      else d.colors.fineprint = colourOf(footerNodes[0].parentElement);
    }
    var body = after.slice(0, after.length - footerNodes.length);

    // Job title (and company, if joined with | or ·): the first plain text after the name.
    var titleNode = body.filter(function (n) { return !inLink(n) && !/^[TMEW]$/.test(text(n)) && text(n).length > 1; })[0];
    if (titleNode && size(titleNode) < nameSize) {
      var bits = text(titleNode).split(/\s*[|·]\s*|\s+[—–-]\s+/);
      d.jobTitle = bits[0];
      if (bits[1]) d.company = bits[1];
      d.colors.title = colourOf(titleNode.parentElement);
    } else {
      titleNode = null;
    }

    // Links: phone, mobile, email, website, social profiles, and anything else as free text.
    var logoLink = "";
    Array.prototype.forEach.call(root.querySelectorAll("a[href]"), function (a) {
      var href = a.getAttribute("href");
      var label = a.textContent.replace(/[\s ]+/g, " ").trim();
      if (footerNodes.some(function (n) { return a.contains(n); })) return;
      if (/^tel:/i.test(href)) {
        if (!d.phone) d.phone = label || href.slice(4);
        else if (!d.mobile) d.mobile = label || href.slice(4);
        d.colors.text = d.colors.text || colourOf(a);
        return;
      }
      if (/^mailto:/i.test(href)) {
        d.email = label || href.slice(7);
        d.colors.text = d.colors.text || colourOf(a);
        return;
      }
      var host = hostOf(href);
      if (!host) return;
      var social = SOCIAL_HOSTS.filter(function (s) { return s[1].test(host); })[0];
      if (social) {
        d.social[social[0]] = href;
        d.colors.social = d.colors.social || colourOf(a);
        return;
      }
      if (a.querySelector("img")) {
        // A linked logo usually points at the website; only use that if no
        // written web address turns up.
        logoLink = logoLink || href;
        return;
      }
      var looksLikeSite = label && host.indexOf(label.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()) === 0;
      if (looksLikeSite && !d.website) {
        d.website = label;
      } else if (label && !d.socialText) {
        d.socialText = label;
        d.socialTextUrl = href;
      }
    });

    if (!d.website && logoLink) d.website = logoLink.replace(/^https?:\/\//i, "").replace(/\/$/, "");

    // Address: plain text that isn't the name, title, footer, a label or a separator.
    var addressLines = body.filter(function (n) {
      var t = text(n);
      return n !== titleNode && !inLink(n) && t.length > 2 && !/^[TMEW]$/.test(t) && !/^[|·•\-–—]+$/.test(t);
    }).map(text);
    if (addressLines.length) {
      d.address = addressLines.join("\n");
      d.colors.address = colourOf(body.filter(function (n) { return text(n) === addressLines[0]; })[0].parentElement);
    }

    // Images: tiny ones are contact icons; the first other one is the logo, the rest are badges.
    var images = Array.prototype.filter.call(root.querySelectorAll("img"), function (img) {
      var w = parseInt(img.getAttribute("width"), 10) || px(img.style.width);
      return !(w && w <= 24);
    });
    images.forEach(function (img, i) {
      var w = parseInt(img.getAttribute("width"), 10) || Math.round(px(img.style.width)) || 0;
      if (i === 0) {
        d.logoUrl = img.getAttribute("src") || "";
        if (w) d.logoWidth = w;
        // Styles that show a logo often leave the company name out of the
        // text; the logo's description usually holds it.
        var alt = (img.getAttribute("alt") || "").trim();
        if (!d.company && alt && !/^(logo|image)$/i.test(alt)) d.company = alt;
      } else {
        d.badges.push({ url: img.getAttribute("src") || "", alt: img.getAttribute("alt") || "", width: w || 64 });
      }
    });

    // Divider colour: the first left border between columns.
    var ruled = Array.prototype.filter.call(root.querySelectorAll("td"), function (td) {
      return td.style.borderLeftStyle === "solid" || td.style.borderTopStyle === "solid";
    })[0];
    if (ruled) d.colors.divider = toHex(ruled.style.borderLeftColor || ruled.style.borderTopColor);

    if (!d.name || !(d.phone || d.mobile || d.email || d.website)) return null;

    // Which built-in style it's closest to.
    var nameFont = firstFamily(inherited(nameNode.parentElement, "font-family")).toLowerCase();
    if (header) {
      d.template = "banner";
      d.colors.headerBg = header.colour;
      d.colors.headerText = d.colors.name;
      delete d.colors.name;
    } else if (nameSize >= 24) {
      d.template = "statement";
    } else if (nameSize >= 19.5) {
      d.template = "stacked";
    } else if (nameSize >= 16 || images.length) {
      d.template = "classic";
    } else {
      d.template = "minimal";
    }
    var fontKey = Object.keys(S.fonts).filter(function (k) { return S.fonts[k].label.toLowerCase() === nameFont; })[0];
    if (fontKey) d.fonts = { name: fontKey };
    Object.keys(d.colors).forEach(function (k) { if (!d.colors[k]) delete d.colors[k]; });
    return d;
  }

  /* ---------- Importing ---------- */

  // Returns a promise of { settings } for a SignOff file, or { custom } for anything else.
  function importHtml(raw, sourceName) {
    raw = String(raw || "");
    if (raw.length > MAX_BYTES) return Promise.reject(new Error("That file is too large to be an email signature."));
    var settings = readSettings(raw);
    if (settings) return Promise.resolve({ settings: settings });

    var doc = new DOMParser().parseFromString(raw, "text/html");
    stripDangerous(doc);
    var hasSheet = Array.prototype.some.call(doc.querySelectorAll("style"), function (s) { return s.textContent.trim(); });
    var stage = hasSheet ? inlineStyles(doc) : Promise.resolve(doc.body.innerHTML);
    return stage.then(function (html) {
      var clean = sanitize(html);
      if (!clean || !parse(clean).body.textContent.trim() && !/<img/i.test(clean)) {
        throw new Error("Couldn't find a signature in that. Try copying it straight from an email instead.");
      }
      return {
        custom: {
          html: clean,
          source: String(sourceName || "Pasted signature").slice(0, 120),
          textEdits: {}, linkEdits: {}, imageEdits: {}, colourSwaps: {}, fontSwaps: {}
        }
      };
    });
  }

  /* ---------- Settings embedded in downloaded files ---------- */

  function toBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromBase64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function settingsComment(state) {
    return "<!-- signoff-settings:" + toBase64(JSON.stringify(state)) + " -->";
  }

  function readSettings(raw) {
    var m = MARKER.exec(raw);
    if (!m) return null;
    try {
      var s = JSON.parse(fromBase64(m[1]));
      return s && typeof s === "object" ? s : null;
    } catch (e) {
      return null;
    }
  }

  S.importer = {
    importHtml: importHtml,
    sanitize: sanitize,
    parts: parts,
    recognise: recognise,
    render: render,
    imageProblem: imageProblem,
    toHex: toHex,
    settingsComment: settingsComment
  };
})();
