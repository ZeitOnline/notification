export const TIMER_STORAGE_KEY = 'z-notification-timeout';
const DEFAULT_TIMER_MS = 3500;

function restoreSavedSelection(form: HTMLFormElement): void {
	const timeoutMs = parseInt(localStorage.getItem(TIMER_STORAGE_KEY) ?? '', 10);
	if (isNaN(timeoutMs)) {
		return;
	}
	const savedRadio = form.querySelector<HTMLInputElement>(
		`input[name="notification-timeout"][value="${timeoutMs}"]`,
	);
	if (savedRadio) {
		savedRadio.checked = true;
	}
}

export function getNotificationTimeout(): number {
	const stored = parseInt(localStorage.getItem(TIMER_STORAGE_KEY) ?? '', 10);
	return isNaN(stored) ? DEFAULT_TIMER_MS : stored;
}

export function initNotificationSettings(form: HTMLFormElement, onSaved?: () => void): void {
	restoreSavedSelection(form);

	form.addEventListener('submit', (event: Event) => {
		event.preventDefault();
		const checkedRadio = form.querySelector<HTMLInputElement>(
			'input[name="notification-timeout"]:checked',
		);
		if (!checkedRadio) {
			return;
		}
		localStorage.setItem(TIMER_STORAGE_KEY, checkedRadio.value);
		onSaved?.();
	});
}
