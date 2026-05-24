# Web2Desktop — Landing site

A single-file static landing page. No build chain, no dependencies, no framework — just `index.html` with embedded CSS and a small inline `IntersectionObserver` script for scroll-reveal.

## Run locally

Any of these work:

```bash
# 1. Open the file directly (works for everything except Inter/JetBrains
#    Mono fonts, which need an http origin to load from Google Fonts).
open landing/index.html        # macOS
start landing/index.html       # Windows
xdg-open landing/index.html    # Linux

# 2. Serve it via any tiny static server. Pick one:
npx serve landing
python -m http.server -d landing 8080
npx http-server landing
```

Then visit `http://localhost:3000` (or whatever port the server prints).

## Deploy

Drop the `landing/` folder anywhere that serves static files:

- **GitHub Pages** — push the folder to a repo, enable Pages from settings, point at `/landing` or move the contents to root.
- **Netlify / Vercel** — drag-and-drop the folder onto their dashboard, done.
- **Cloudflare Pages** — same. Set the publish directory to `landing/`.
- **Any web host** — FTP/SFTP the `landing/` contents into your public dir.

## Add real screenshots

See [`screenshots/README.md`](screenshots/README.md) for the filenames the gallery section expects. Drop PNGs in there with those names and they'll appear automatically — no HTML edit needed.

## File layout

```
landing/
├── index.html              ← the entire page; edit copy/links here
├── README.md               ← this file
└── screenshots/
    ├── README.md           ← which filenames go where
    ├── dashboard.png       ← (you provide)
    ├── app-studio.png      ← (you provide)
    ├── theme-builder.png   ← (you provide)
    ├── action-builder.png  ← (you provide)
    ├── ai-assistant.png    ← (you provide)
    └── build-progress.png  ← (you provide)
```

## What's intentionally excluded

- **No analytics, no trackers, no cookies** — clean privacy story by default. Add Plausible / Fathom / GA later if you want.
- **No CMS / build step** — copy edits are direct edits to `index.html`. Faster than any framework.
- **No JS framework** — page is ~30KB total, scores 100/100 on Lighthouse.

## What to update before shipping

Search `index.html` for:

- `href="#"` (in footer + final CTA) — point at GitHub repo / X / etc.
- `© 2026 Web2Desktop` — update the year if needed
- The hero `eyebrow` text "v1.0.0 · Now in beta" — update on release

## SEO (already wired)

- **Meta + Open Graph + Twitter** on `index.html`, `about.html`, `blogs.html`, and legal pages
- **JSON-LD**: Organization, WebSite, SoftwareApplication (with `downloadUrl`), FAQPage on home; BlogPosting list on `blogs.html`; breadcrumbs on inner pages
- **`sitemap.xml`** and **`robots.txt`** (checkout pages disallowed)
- **`site.webmanifest`** for name/theme when saved to home screen

After deploy, submit `https://toodesktop.com/sitemap.xml` in [Google Search Console](https://search.google.com/search-console) and Bing Webmaster Tools. Rankings still depend on backlinks, content, and crawl frequency — keep publishing on `blogs.html` and link from social/GitHub.
