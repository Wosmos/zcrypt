/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

// CSS `corner-shape` (CSS Borders & Box Decorations L4 — Chrome 139+).
// Progressive enhancement: it only affects corners that already have a
// `border-radius`, so always pair these with a `rounded-*` utility. Browsers
// without support simply ignore it and render the normal rounded radius.
const cornerShape = plugin(({ addUtilities, matchUtilities }) => {
  addUtilities({
    ".corner-round": { "corner-shape": "round" },
    ".corner-squircle": { "corner-shape": "squircle" },
    ".corner-bevel": { "corner-shape": "bevel" },
    ".corner-scoop": { "corner-shape": "scoop" },
    ".corner-notch": { "corner-shape": "notch" },
    ".corner-square": { "corner-shape": "square" },
  });
  // Arbitrary values, e.g. `corner-shape-[superellipse(4)]`.
  matchUtilities({
    "corner-shape": (value) => ({ "corner-shape": value }),
  });
});

module.exports = {
  darkMode: ["class", "class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	screens: {
  		xs: '480px',
  		sm: '640px',
  		md: '768px',
  		lg: '1024px',
  		xl: '1280px',
  		'2xl': '1536px'
  	},
  	extend: {
  		fontFamily: {
  			heading: [
  				'var(--font-heading)',
  				'sans-serif'
  			],
  			body: [
  				'var(--font-body)',
  				'sans-serif'
  			],
  			logo: [
  				'var(--font-logo)',
  				'sans-serif'
  			]
  		},
  		colors: {
  			brand: {
  				DEFAULT: 'var(--color-accent)',
  				hover: 'var(--color-accent-hover)'
  			},
  			border: 'var(--color-border)',
  			input: 'var(--color-border)',
  			ring: 'var(--color-accent)',
  			background: 'var(--color-bg)',
  			foreground: 'var(--color-text)',
  			primary: {
  				DEFAULT: 'var(--color-accent)',
  				foreground: '#04181b'
  			},
  			secondary: {
  				DEFAULT: 'var(--color-surface-2)',
  				foreground: 'var(--color-text)'
  			},
  			destructive: {
  				DEFAULT: '#ef4444',
  				foreground: '#ffffff'
  			},
  			muted: {
  				DEFAULT: 'var(--color-surface-1)',
  				foreground: 'var(--color-text-muted)'
  			},
  			accent: {
  				DEFAULT: 'var(--color-surface-2)',
  				foreground: 'var(--color-text)'
  			},
  			popover: {
  				DEFAULT: 'var(--color-surface)',
  				foreground: 'var(--color-text)'
  			},
  			card: {
  				DEFAULT: 'var(--color-surface)',
  				foreground: 'var(--color-text)'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [cornerShape, require("tailwindcss-animate")],
};
