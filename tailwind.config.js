/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens — values live in src/index.css as CSS custom
        // properties keyed by [data-theme="..."]. Switching themes at
        // runtime just toggles the data-theme attribute on <html>.
        // Surface + text colors are RGB triplets so Tailwind's opacity
        // utilities (`bg-bg-card/70`) keep working. Borders are full
        // color values because they bake in their own alpha.
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",
          panel:   "rgb(var(--bg-panel) / <alpha-value>)",
          card:    "rgb(var(--bg-card) / <alpha-value>)",
          input:   "rgb(var(--bg-input) / <alpha-value>)",
          elev:    "rgb(var(--bg-elev) / <alpha-value>)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong:  "var(--border-strong)",
          glow:    "var(--border-glow)",
        },
        text: {
          primary:   "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          muted:     "rgb(var(--text-muted) / <alpha-value>)",
          inverse:   "rgb(var(--text-inverse) / <alpha-value>)",
        },
        accent: {
          blue:    "rgb(var(--accent-blue) / <alpha-value>)",
          cyan:    "rgb(var(--accent-cyan) / <alpha-value>)",
          violet:  "rgb(var(--accent-violet) / <alpha-value>)",
          pink:    "rgb(var(--accent-pink) / <alpha-value>)",
          green:   "rgb(var(--accent-green) / <alpha-value>)",
          amber:   "rgb(var(--accent-amber) / <alpha-value>)",
          yellow:  "rgb(var(--accent-yellow) / <alpha-value>)",
          red:     "rgb(var(--accent-red) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        // tighter scale for desktop density
        DEFAULT: "0.5rem",
      },
      boxShadow: {
        // Theme-aware shadows. Light theme overrides them in index.css so
        // shadows on a white surface aren't pitch black.
        glass:    "var(--shadow-glass)",
        elev:     "var(--shadow-elev)",
        glow:         "0 0 0 1px rgb(var(--accent-blue) / 0.4), 0 0 24px -4px rgb(var(--accent-blue) / 0.45)",
        "glow-violet": "0 0 0 1px rgb(var(--accent-violet) / 0.4), 0 0 24px -4px rgb(var(--accent-violet) / 0.45)",
        "glow-green":  "0 0 0 1px rgb(var(--accent-green) / 0.4), 0 0 24px -4px rgb(var(--accent-green) / 0.45)",
        rail:     "1px 0 0 0 var(--border)",
      },
      backdropBlur: {
        xs: "4px",
      },
      backgroundImage: {
        // ambient gradients for the canvas
        "mesh-violet": "radial-gradient(60% 40% at 10% -10%, rgba(167,139,250,0.18) 0%, transparent 60%), radial-gradient(45% 35% at 100% 0%, rgba(34,211,238,0.12) 0%, transparent 60%), radial-gradient(50% 45% at 50% 110%, rgba(91,157,255,0.10) 0%, transparent 60%)",
        "mesh-blue": "radial-gradient(50% 35% at 0% 0%, rgba(91,157,255,0.16) 0%, transparent 60%), radial-gradient(40% 30% at 100% 100%, rgba(167,139,250,0.10) 0%, transparent 60%)",
        "stripe-soft": "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
        "neon-line": "linear-gradient(90deg, transparent, rgba(91,157,255,0.6), transparent)",
      },
      animation: {
        "fade-in":  "fadeIn 200ms ease-out",
        "slide-up": "slideUp 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "shimmer":  "shimmer 2.4s linear infinite",
        "pulse-soft": "pulseSoft 2.6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        shimmer:   { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        pulseSoft: { "0%,100%": { opacity: 0.55 }, "50%": { opacity: 1 } },
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
