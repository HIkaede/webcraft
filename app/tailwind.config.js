/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- Minecraft UI palette (design.md §3.1) ----
        mc: {
          text: '#FFFFFF',
          'text-shadow': '#3F3F3F',
          yellow: '#FFFF00',
          'yellow-shadow': '#3F3F00',
          'gray-desc': '#A0A0A0',
          'gray-line': '#808080',
          red: '#FF5555',
          green: '#55FF55',
          'xp-green': '#80FF20',
          gold: '#FCFC54',
          btn: {
            face: '#707070',
            'face-top': '#7E7E7E',
            'face-bottom': '#5F5F5F',
            border: '#000000',
            hover: '#7D88B4',
            'hover-top': '#8A94C4',
            'hover-bottom': '#6B72A0',
            disabled: '#5E5E5E'
          },
          panel: {
            DEFAULT: '#C6C6C6',
            dark: '#373737',
            hi: '#FFFFFF',
            lo: '#555555'
          },
          slot: '#8B8B8B',
          tooltip: {
            bg: 'rgba(16,0,16,0.94)',
            'border-top': '#5000FF',
            'border-bottom': '#28007F'
          }
        },
        // ---- shadcn tokens (keep) ----
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
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
      },
      fontFamily: {
        // design.md §4 — 拉丁像素字体优先，中文落 Noto Sans SC
        pixel: ['Minecraft', "'Press Start 2P'", "'Noto Sans SC'", 'monospace'],
        zh: ["'Noto Sans SC'", 'sans-serif']
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xs: 'calc(var(--radius) - 6px)'
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
