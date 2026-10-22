# SignOff

A free, simple email signature maker. Fill in your details, pick a style, copy, paste into Outlook, Gmail or Apple Mail. No sign-up, no server: everything runs in the browser and drafts are saved only on the user's own device.

## Using it locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8123
```

Then go to http://localhost:8123.

## Publishing on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save.
3. The site appears at `https://<username>.github.io/<repository>/` within a minute or two.

No build step is needed.

## Project layout

```
index.html          the app page
.nojekyll           tells GitHub Pages to serve files as-is
css/app.css         app styling (not used in signatures)
js/templates.js     signature templates: produce the email HTML
js/app.js           editor, live preview, copy and download
```

## Email-safe rules for templates

Signatures are pasted into mail clients with very limited HTML support (Outlook classic uses Microsoft Word to render email). Every template in `js/templates.js` follows these rules:

- Table layout with inline styles only. No `<style>` blocks, classes, flexbox or grid.
- System fonts only (Arial, Helvetica, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman).
- Images by public `https://` URL only. No base64 / `data:` images, as most clients block them.
- Every image has `alt` text and a `width` attribute.
- Solid colours use both `bgcolor` and `background-color`. No background images.
- All user input is HTML-escaped before it reaches the markup.

## Adding a template

Write a function in `js/templates.js` that takes the data object and returns an HTML string, using the shared helpers (`contactItems`, `socialHtml`, `logoHtml`, `footerRow`, `table`, `td`). Add it to the `TEMPLATES` list. It appears in the style picker automatically.

## Testing checklist

The in-app preview is a browser render, not a mail client. Before relying on a template, send a real test email and check it in:

- Outlook (new), Outlook classic and Outlook web
- Outlook mobile (iOS and Android)
- Gmail web and app
- Apple Mail (Mac and iPhone)
- Dark mode in Outlook and Gmail
- With images blocked (alt text should show and the layout should hold)
- Replies and forwards
