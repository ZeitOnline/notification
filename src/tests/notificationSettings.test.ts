import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initNotificationSettings, TIMER_STORAGE_KEY } from '../notificationSettings';

const buildForm = (values: number[]): HTMLFormElement => {
	const form = document.createElement('form');
	values.forEach(value => {
		const radio = document.createElement('input');
		radio.type = 'radio';
		radio.name = 'notification-timeout';
		radio.value = String(value);
		form.append(radio);
	});
	document.body.append(form);
	return form;
};

describe('initNotificationSettings', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		localStorage.clear();
	});

	it('restores the previously saved selection on init', () => {
		localStorage.setItem(TIMER_STORAGE_KEY, '5000');
		const form = buildForm([0, 3000, 5000, 8000]);
		initNotificationSettings(form);

		const checked = form.querySelector<HTMLInputElement>('input:checked');
		expect(checked?.value).toBe('5000');
	});

	it('saves the selected value to localStorage on submit', () => {
		const form = buildForm([0, 3000, 5000, 8000]);
		initNotificationSettings(form);

		form.querySelector<HTMLInputElement>('input[value="8000"]')!.checked = true;
		form.dispatchEvent(new Event('submit'));

		expect(localStorage.getItem(TIMER_STORAGE_KEY)).toBe('8000');
	});

	it('calls onSaved after saving', () => {
		const onSaved = vi.fn();
		const form = buildForm([0, 3000, 5000, 8000]);
		initNotificationSettings(form, onSaved);

		form.querySelector<HTMLInputElement>('input[value="3000"]')!.checked = true;
		form.dispatchEvent(new Event('submit'));

		expect(onSaved).toHaveBeenCalledTimes(1);
	});

	it('does not save if no radio is checked on submit', () => {
		const form = buildForm([0, 3000, 5000, 8000]);
		initNotificationSettings(form);

		form.dispatchEvent(new Event('submit'));

		expect(localStorage.getItem(TIMER_STORAGE_KEY)).toBeNull();
	});

});

