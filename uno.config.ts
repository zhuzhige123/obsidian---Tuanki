import { defineConfig, presetUno, presetAttributify, presetTypography } from "unocss";
import extractorSvelte from "@unocss/extractor-svelte";

export default defineConfig({
	extractors: [extractorSvelte()],
	content: {
		filesystem: [
			'src/**/*.{html,js,ts,svelte}',
		],
	},
	presets: [
		presetUno(),
		presetAttributify(),
		presetTypography(),
	],
	theme: {
		colors: {
			// Tuanki 品牌色彩系统
			primary: {
				50: '#f5f3ff',
				100: '#ede9fe',
				200: '#ddd6fe',
				300: '#c4b5fd',
				400: '#a78bfa',
				500: '#8b5cf6',
				600: '#7c3aed',
				700: '#6d28d9',
				800: '#5b21b6',
				900: '#4c1d95',
			},
			// 功能色彩
			success: '#10b981',
			warning: '#f59e0b',
			error: '#ef4444',
			info: '#3b82f6',
		},
		fontFamily: {
			sans: ['var(--font-interface)', 'system-ui', 'sans-serif'],
			mono: ['var(--font-monospace)', 'monospace'],
		},
		spacing: {
			'xs': '0.25rem',
			'sm': '0.5rem',
			'md': '1rem',
			'lg': '1.5rem',
			'xl': '2rem',
			'2xl': '3rem',
		},
		borderRadius: {
			'sm': '0.375rem',
			'md': '0.5rem',
			'lg': '0.75rem',
			'xl': '1rem',
		},
		boxShadow: {
			'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
			'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
			'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
			'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
			'glow': '0 4px 12px rgba(139, 92, 246, 0.3)',
		},
	},
	shortcuts: {
		// 按钮快捷类
		'btn-primary': 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-md font-medium hover:bg-primary-600 transition-all duration-200 cursor-pointer',
		'btn-secondary': 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-md font-medium hover:bg-gray-200 transition-all duration-200 cursor-pointer',
		'btn-ghost': 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-transparent text-gray-700 rounded-md font-medium hover:bg-gray-100 transition-all duration-200 cursor-pointer',

		// 卡片快捷类
		'card': 'bg-white rounded-lg border border-gray-200 shadow-sm',
		'card-hover': 'hover:shadow-md hover:border-gray-300 transition-all duration-200',

		// 布局快捷类
		'flex-center': 'flex items-center justify-center',
		'flex-between': 'flex items-center justify-between',

		// 文本快捷类
		'text-gradient': 'bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent',
	},
	rules: [
		// 自定义规则 - 使用统一的变量名
		[/^tuanki-shadow-(.+)$/, ([, c]) => ({ 'box-shadow': `var(--tuanki-shadow-${c})` })],
		[/^tuanki-space-(.+)$/, ([, c]) => ({ 'padding': `var(--tuanki-space-${c})` })],
		[/^tuanki-gradient-(.+)$/, ([, c]) => ({ 'background': `var(--tuanki-gradient-${c})` })],
	],
	safelist: [
		// 确保这些类始终被包含
		'tuanki-app',
		'tuanki-card',
		'tuanki-btn',
		'tuanki-gradient-text',
		'tuanki-fade-in',
		'tuanki-loading',
		'btn-primary',
		'btn-secondary',
		'btn-ghost',
		'card',
		'card-hover',
		'flex-center',
		'flex-between',
		'text-gradient',
	],
});
