# SignOff

A free, simple email signature maker. Fill in your details, pick a style, copy, paste into Outlook, Gmail or Apple Mail. No sign-up, no server: everything runs in the browser and drafts are saved only on the user's own device.

## Using it locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8123
```

Then go to http://localhost:8123.

## Project layout

```
index.html          the app page
.nojekyll           tells GitHub Pages to serve files as-is
css/app.css         app styling (not used in signatures)
js/themes.js        colour roles, preset themes and the icon colour palette
js/templates.js     signature templates: produce the email HTML
js/importer.js      opens existing signatures: cleans untrusted HTML, turns style
                    sheets into inline styles, and powers the Custom style
js/app.js           editor, live preview, copy and download
assets/icons/v1/    default contact icons (PNG, one set per preset colour)
tools/make_icons.py regenerates the icons (needs Python + Pillow)
```

Signatures link to the icons at their published address, so files under `assets/` must never be renamed or replaced in place: mail clients cache images. To change an icon, bump `VERSION` in `tools/make_icons.py` and `ICON_VERSION` in `js/templates.js`, regenerate, and commit the new folder alongside the old one.

## Email-safe rules for templates

Signatures are pasted into mail clients with very limited HTML support (Outlook classic uses Microsoft Word to render email). Every template in `js/templates.js` follows these rules:

- Table layout with inline styles only. No `<style>` blocks, classes, flexbox or grid.
- System fonts only (Arial, Helvetica, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman).
- Images by public `https://` URL only. No base64 / `data:` images, as most clients block them.
- Every image has `alt` text and a `width` attribute.
- Solid colours use both `bgcolor` and `background-color`. No background images.
- All user input is HTML-escaped before it reaches the markup.

## Adding a template

Write a function in `js/templates.js` that takes the data object and returns an HTML string, using the shared helpers (`contactItems`, `socialHtml`, `logoHtml`, `badgesRow`, `footerRow`, `table`, `td`). Never hard-code a colour or font: use `col(d, role)` and `fnt(d, role)` so themes and per-part overrides work. Add it to the `TEMPLATES` list with the colour `roles` it uses. It appears in the style picker, and its colour controls in the editor, automatically.

## Opening existing signatures

- **Files downloaded from SignOff** end with a `<!-- signoff-settings:… -->` comment holding every setting. Opening one restores the editor exactly. Copied signatures don't carry this, to keep sent emails small.
- **Anything else** (an Outlook `.htm` file, any HTML, or a signature pasted from an email) becomes a **Custom** style. Its HTML is treated as untrusted: it's parsed inertly and rebuilt from an allowlist of tags, attributes and CSS properties, so scripts, forms, event handlers and unsafe links never reach the page. Style sheets are converted to inline styles first, since email apps discard them.

## Testing checklist

The in-app preview is a browser render, not a mail client. Before relying on a template, send a real test email and check it in:

- Outlook (new), Outlook classic and Outlook web
- Outlook mobile (iOS and Android)
- Gmail web and app
- Apple Mail (Mac and iPhone)
- Dark mode in Outlook and Gmail
- With images blocked (alt text should show and the layout should hold)
- Replies and forwards
