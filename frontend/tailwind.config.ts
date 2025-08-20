// Tailwind CSS configuration merging gradients with CSS variable-driven theme, Inter font, and animations
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar-background)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
        adderrels: {
          50: 'hsl(var(--adderrels-50))',
          100: 'hsl(var(--adderrels-100))',
          200: 'hsl(var(--adderrels-200))',
          300: 'hsl(var(--adderrels-300))',
          400: 'hsl(var(--adderrels-400))',
          500: 'hsl(var(--adderrels-500))',
          600: 'hsl(var(--adderrels-600))',
          700: 'hsl(var(--adderrels-700))',
          800: 'hsl(var(--adderrels-800))',
          900: 'hsl(var(--adderrels-900))',
        },
        dark: {
          50: 'hsl(var(--dark-50))',
          100: 'hsl(var(--dark-100))',
          200: 'hsl(var(--dark-200))',
          300: 'hsl(var(--dark-300))',
          400: 'hsl(var(--dark-400))',
          500: 'hsl(var(--dark-500))',
          600: 'hsl(var(--dark-600))',
          700: 'hsl(var(--dark-700))',
          800: 'hsl(var(--dark-800))',
          900: 'hsl(var(--dark-900))',
          950: 'hsl(var(--dark-950))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Preserve existing gradients and effects
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-primary': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'gradient-sunset': 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
        'gradient-ocean': 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #8b5cf6 100%)',
        'gradient-dark': 'linear-gradient(135deg, #171717 0%, #262626 100%)',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        'gradient-glow': 'radial-gradient(circle at center, rgba(249,115,22,0.15) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-sm': '0 2px 20px -5px rgba(249,115,22,0.5)',
        'glow-md': '0 4px 30px -5px rgba(249,115,22,0.6)',
        'glow-lg': '0 10px 40px -5px rgba(249,115,22,0.7)',
        'inner-glow': 'inset 0 2px 20px -5px rgba(249,115,22,0.3)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(255, 107, 53, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(255, 107, 53, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'border-glow': {
          '0%, 100%': {
            'border-color': 'rgba(249,115,22,0.3)',
            'box-shadow': '0 0 20px rgba(249,115,22,0.1)',
          },
          '50%': {
            'border-color': 'rgba(249,115,22,0.8)',
            'box-shadow': '0 0 30px rgba(249,115,22,0.4)',
          },
        },
        'text-glow': {
          '0%, 100%': { 'text-shadow': '0 0 10px rgba(249,115,22,0.3)' },
          '50%': { 'text-shadow': '0 0 20px rgba(249,115,22,0.8), 0 0 30px rgba(249,115,22,0.6)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'gradient-shift': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
        float: 'float 6s ease-in-out infinite',
        gradient: 'gradient 15s ease infinite',
        'border-glow': 'border-glow 3s ease-in-out infinite',
        'text-glow': 'text-glow 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 6s ease infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config
