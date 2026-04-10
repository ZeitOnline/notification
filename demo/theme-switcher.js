const STORAGE_KEY = 'demo-theme';

function readStoredTheme(storageKey) {
	try {
		return localStorage.getItem(storageKey) || 'system';
	} catch (error) {
		return 'system';
	}
}

function writeStoredTheme(storageKey, theme) {
	try {
		localStorage.setItem(storageKey, theme);
	} catch (error) {
		// Ignore storage failures and keep the session-only state.
	}
}

function getSystemTheme() {
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';
}

function applyTheme(theme) {
	const root = document.documentElement;
	root.classList.remove('color-scheme-light', 'color-scheme-dark');

	if (theme === 'light' || theme === 'dark') {
		root.classList.add(`color-scheme-${theme}`);
	}
}

function syncThemeSelection(theme, radios) {
	radios.forEach(radio => {
		radio.checked = radio.value === theme;
	});
}

export function initThemeSwitcher({
	storageKey = STORAGE_KEY,
	radios = document.querySelectorAll('input[name="theme-option"]'),
} = {}) {
	const themeRadios = Array.from(radios);
	const mediaQuery =
		window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

	function applyStoredTheme(theme) {
		const nextTheme = theme === 'system' ? getSystemTheme() : theme;
		writeStoredTheme(storageKey, theme);
		syncThemeSelection(theme, themeRadios);
		applyTheme(nextTheme);
	}

	applyStoredTheme(readStoredTheme(storageKey));

	if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
		mediaQuery.addEventListener('change', () => {
			if (readStoredTheme(storageKey) === 'system') {
				applyTheme(getSystemTheme());
			}
		});
	}

	themeRadios.forEach(radio => {
		radio.addEventListener('change', event => {
			const target = event.target;

			if (target && target.checked) {
				applyStoredTheme(target.value);
			}
		});
	});
}
