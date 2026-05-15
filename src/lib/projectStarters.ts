/**
 * Project starters — full Electron source projects (NOT URL wrappers).
 *
 * Each entry corresponds to a directory under `templates/starters/<id>/`
 * which the template generator copies into the user's workspace when they
 * pick that starter. The starter's main.js / preload.js / index.html ship
 * as the actual app source — users can edit them in App Studio's Page-code
 * section, build to .exe, OR export the whole source folder to develop
 * outside WebToDesktop Builder.
 *
 * Adding a new starter = create the directory + add an entry here.
 */

export interface ProjectStarter {
  id: string;
  name: string;
  tagline: string;
  /** Two-tone gradient for the card thumbnail. */
  grad: [string, string];
  /** Short symbol shown on the thumbnail. */
  glyph: string;
  /** What's inside, in 3-6 short bullets. Renders on the card detail. */
  features: readonly string[];
  /** Default window dimensions for projects created from this starter. */
  window: { width: number; height: number };
  /** Default product name when the user hasn't typed one yet. */
  defaultName: string;
}

export const PROJECT_STARTERS: ProjectStarter[] = [
  {
    id: "blank",
    name: "Blank Electron",
    tagline: "Minimal Electron app, no build chain — pure HTML/CSS/JS.",
    grad: ["#3b82f6", "#06b6d4"],
    glyph: "{}",
    features: [
      "main.js + preload.js + index.html — three files, total clarity",
      "Plain CSS / vanilla JS in app.js, zero bundler setup",
      "IPC bridge wired (window.api) with a counter example",
      "Builds to .exe / .dmg / .AppImage via the same pipeline",
    ],
    window: { width: 1100, height: 760 },
    defaultName: "My App",
  },
];

export const PROJECT_STARTERS_BY_ID: Record<string, ProjectStarter> = Object.fromEntries(
  PROJECT_STARTERS.map((s) => [s.id, s]),
);
