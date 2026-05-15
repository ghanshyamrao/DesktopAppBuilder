# Screenshots

Drop your captured PNGs / JPGs into this folder. The landing page (`../index.html`) auto-loads them by these exact filenames (case-sensitive on Linux/macOS hosts; spaces in filenames are URL-encoded as `%20` in the HTML).

| Filename                | Where it goes              | What to capture                                                  |
| ----------------------- | -------------------------- | ---------------------------------------------------------------- |
| `Dashboard.png`         | Gallery → Dashboard        | The Dashboard with templates row + recent applications visible.  |
| `App Studio.png`        | Gallery → App Studio       | App Studio editing a project — left rail, sub-nav, preview.      |
| `Theme Builder.png`     | Gallery → Theme Builder    | Theme Builder with a preset selected and the live preview lit.   |
| `Action Builder.png`    | Gallery → Action Builder   | Action Builder with all capability cards visible.                |
| `Ai Assistant.png`      | Gallery → AI Assistant     | AI chat with a draft + action chips visible.                     |
| `Settings.png`          | Gallery → Settings         | The Settings page with the sub-rail and a section visible.       |

## Notes

- **Missing files won't break the page** — each `<img>` has an `onerror` fallback that shows a stylized CSS mockup of the screen with the same look. So you can drop screenshots in one at a time and the others continue to render as polished mockups until you replace them.
- **Filename casing matters.** GitHub Pages, Netlify, Cloudflare, and most linux web hosts are case-sensitive. The HTML references match this folder exactly; if you rename a file, update the matching `<img src=>` in `../index.html`.
- **Spaces in filenames** are encoded as `%20` in the HTML (`App%20Studio.png` for `App Studio.png`). If you swap a screenshot for one without spaces, update the HTML to drop the `%20`.
- **Format**: PNG works best for crisp text in app screenshots. JPG saves bandwidth for photo-heavy captures.
- **Hero replacement**: the hero illustration is currently a CSS-only mockup of the app shell. To swap in a real screenshot, edit `../index.html` and replace the `<div class="mock-window" id="hero-mock">…</div>` block with `<img src="screenshots/hero.png" alt="Web2Desktop dashboard" style="width:100%;border-radius:14px;border:1px solid var(--border);box-shadow:0 24px 80px -24px rgba(0,0,0,0.5);" />`.

## How to capture cleanly

1. Run the app at a window size around 1600×1000 — fits a 14"-laptop preview without wrapping.
2. Use the OS's native window snip tool — Win+Shift+S on Windows, Cmd+Shift+4 on macOS.
3. Crop to the app window only (no OS title bar — the app renders its own).
4. Save into this folder under the exact filename from the table above.
