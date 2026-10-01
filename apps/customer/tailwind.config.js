const { hairlineWidth } = require("nativewind/theme");

/** Colours are RGB channels in CSS variables so the admin-configured theme can replace them at runtime. */
const color = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: color("border"),
        input: color("input"),
        ring: color("ring"),
        background: color("background"),
        foreground: color("foreground"),
        primary: { DEFAULT: color("primary"), foreground: color("primary-foreground") },
        highlight: { DEFAULT: color("highlight"), foreground: color("highlight-foreground") },
        secondary: { DEFAULT: color("secondary"), foreground: color("secondary-foreground") },
        destructive: { DEFAULT: color("destructive"), foreground: color("destructive-foreground") },
        muted: { DEFAULT: color("muted"), foreground: color("muted-foreground") },
        accent: { DEFAULT: color("accent"), foreground: color("accent-foreground") },
        popover: { DEFAULT: color("popover"), foreground: color("popover-foreground") },
        card: { DEFAULT: color("card"), foreground: color("card-foreground") },
        tile: color("tile"),
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
