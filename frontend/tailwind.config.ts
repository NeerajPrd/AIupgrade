import type { Config } from "tailwindcss";

/* Spirit Monkey palettes. The theme lives here and in src/app/globals.css.
   brand: Tailwind's blue scale with 600 set to the logo blue (#1858e4); 500 is the
   spirit-monkey.com blue (#3b82f6). purple/violet are mapped to it, so older
   purple accents across the dashboard follow the brand automatically.
   ink: blue-tinted greys (navy at the dark end, from the logo's #000234) used for
   gray/zinc/neutral, so neutral surfaces and dark mode match the logo too. */
const brand = {
	50: "#eff6ff",
	100: "#dbeafe",
	200: "#bfdbfe",
	300: "#93c5fd",
	400: "#60a5fa",
	500: "#3b82f6",
	600: "#1858e4",
	700: "#1d4ed8",
	800: "#1e40af",
	900: "#1e3a8a",
	950: "#172554",
};
const ink = {
	50: "#f8fafc",
	100: "#f1f5f9",
	200: "#e2e8f0",
	300: "#cbd5e1",
	400: "#94a3b8",
	500: "#64748b",
	600: "#475569",
	700: "#2b3557",
	800: "#1a2244",
	900: "#0f1530",
	950: "#080c21",
};
const navy = {
	DEFAULT: "#000234",
	600: "#34449a",
	700: "#24306b",
	800: "#18204a",
	900: "#0f1530",
	950: "#080c21",
};

const config: Config = {
	darkMode: ["class"],
	content: [
		"./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./src/components/**/*.{js,ts,jsx,tsx,mdx}",
		"./src/app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			maxHeight: {
				'90vh': '90vh'
			},
			maxWidth: {
				'90vw': '90vw'
			},
			animation: {
				'spin-slow': 'spin 3s linear infinite',
				'bounce-slow': 'bounce 3s infinite',
				gradient: 'gradient 8s linear infinite',
				shake: 'shake 0.5s linear'
			},
			keyframes: {
				gradient: {
					'0%, 100%': {
						'background-size': '200% 200%',
						'background-position': 'left center'
					},
					'50%': {
						'background-size': '200% 200%',
						'background-position': 'right center'
					}
				},
				shake: {
					'0%, 100%': {
						transform: 'translateX(0)'
					},
					'25%': {
						transform: 'translateX(5px)'
					},
					'75%': {
						transform: 'translateX(-5px)'
					}
				}
			},
			typography: {
				DEFAULT: {
					css: {
						maxWidth: 'none',
						color: 'null',
						pre: {
							padding: '0',
							margin: '0',
							backgroundColor: 'transparent',
							color: 'null'
						},
						code: {
							padding: '0.2em 0.4em',
							borderRadius: '6px',
							backgroundColor: 'rgba(0, 0, 0, 0.1)',
							color: 'null',
							'&::before': {
								content: ''
							},
							'&::after': {
								content: ''
							}
						},
						'code::before': {
							content: ''
						},
						'code::after': {
							content: ''
						},
						'blockquote p:first-of-type::before': {
							content: 'none'
						},
						'blockquote p:last-of-type::after': {
							content: 'none'
						}
					}
				},
				xs: {
					css: {
						fontSize: '13px',
						lineHeight: '1.4',
						p: {
							marginTop: '0.5em',
							marginBottom: '0.5em'
						},
						h1: {
							fontSize: '18px',
							marginTop: '1.5em',
							marginBottom: '0.5em'
						},
						h2: {
							fontSize: '16px',
							marginTop: '1.2em',
							marginBottom: '0.5em'
						},
						h3: {
							fontSize: '14px',
							marginTop: '1em',
							marginBottom: '0.5em'
						},
						li: {
							marginTop: '0.25em',
							marginBottom: '0.25em'
						},
						pre: {
							fontSize: '11px'
						},
						code: {
							fontSize: '11px'
						}
					}
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			colors: {
				brand: { ...brand, DEFAULT: brand[600], sky: "#1898e8" },
				navy,
				purple: brand,
				violet: brand,
				gray: ink,
				zinc: ink,
				neutral: ink,
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			}
		}
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;
