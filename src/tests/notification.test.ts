import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

import { Notification } from '../notification';

const ensureDialogMethods = (): void => {
	if (!HTMLDialogElement.prototype.show) {
		HTMLDialogElement.prototype.show = function show(): void {
			this.setAttribute('open', '');
		};
	}

	if (!HTMLDialogElement.prototype.close) {
		HTMLDialogElement.prototype.close = function close(): void {
			this.removeAttribute('open');
		};
	}
};

describe('notification accessibility behavior', () => {
	let notification: Notification;

	beforeEach(() => {
		ensureDialogMethods();
		Notification.instance = undefined;
		document.body.innerHTML = '';
		vi.useFakeTimers();
		notification = new Notification();
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		document.body.innerHTML = '';
		Notification.instance = undefined;
	});

	it('keeps focus on the trigger and exposes inline messages through a polite live region', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);
		trigger.focus();

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await vi.advanceTimersByTimeAsync(50);
		await showInlinePromise;

		const inlineMessage = document.querySelector('.z-notification-inline');

		expect(document.activeElement).toBe(trigger);
		expect(inlineMessage).not.toBeNull();
		expect(inlineMessage?.getAttribute('role')).toBe('status');
		expect(inlineMessage?.getAttribute('aria-live')).toBe('polite');
		expect(inlineMessage?.getAttribute('aria-atomic')).toBe('true');
		expect((inlineMessage as HTMLElement | null)?.innerText).toBe('Link copied to clipboard.');
	});

	it('keeps bottom notification controls in rendered keyboard order and exposes an assertive live message', async () => {
		const message = 'Publishing failed. Check the form and try again.';

		notification.show({
			message,
			status: 'error',
			button: {
				text: 'Retry',
				onClick: vi.fn(),
			},
		});

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});
		const notificationMessage = screen.getByText(message);
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		const actionButton = screen.getByRole('button', { name: 'Retry' });

		expect(notificationMessage).not.toBeNull();
		expect(notificationMessage.textContent).toBe(message);

		await user.tab();
		expect(document.activeElement).toBe(actionButton);

		await user.tab();
		expect(document.activeElement).toBe(closeButton);
	});

	it('allows keyboard navigation to link actions in bottom notifications', async () => {
		notification.show({
			message: 'A new version of notification is available.',
			status: 'info',
			link: {
				text: 'Open docs',
				href: 'https://example.com/docs',
			},
		});

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		const actionLink = screen.getByRole('link', { name: 'Open docs' });

		await user.tab();
		expect(document.activeElement).toBe(actionLink);

		await user.tab();
		expect(document.activeElement).toBe(closeButton);
		expect(actionLink.getAttribute('href')).toBe('https://example.com/docs');
	});

	it('inserts anchored bottom notifications next to the triggering element', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Save';
		document.body.append(trigger);
		const message = 'Profile saved successfully.';

		notification.show({
			element: trigger,
			message,
			status: 'success',
		});

		const container = document.querySelector('.z-notification');

		expect(trigger.nextElementSibling).toBe(container);
		expect(document.body.querySelectorAll('.z-notification')).toHaveLength(1);
		expect(document.querySelector('dialog')).toBeNull();
		expect(container?.classList.contains('z-notification--bottom')).toBe(true);
		expect(container?.nodeName).toBe('DIV');
		expect(screen.getByText(message)).not.toBeNull();
	});

	it('stacks multiple anchored bottom notifications by index', () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Save';
		document.body.append(trigger);

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
				const height = this.classList.contains('z-notification') ? 40 : 20;
				return {
					x: 0,
					y: 0,
					top: 0,
					left: 0,
					right: 100,
					bottom: height,
					width: 100,
					height,
					toJSON: () => ({}),
				} as DOMRect;
			});

		notification.show({
			element: trigger,
			message: 'First saved toast.',
			status: 'success',
		});
		notification.show({
			element: trigger,
			message: 'Second saved toast.',
			status: 'success',
		});

		const toasts = Array.from(document.querySelectorAll('.z-notification')) as HTMLElement[];

		expect(toasts).toHaveLength(2);
		expect(trigger.nextElementSibling).toBe(toasts[0]);
		expect(toasts[0].nextElementSibling).toBe(toasts[1]);
		expect(toasts[0].style.bottom).toContain('calc(24px');
		expect(toasts[1].style.bottom).toContain('calc(72px');
		expect(toasts[0].style.zIndex).toBe('800');
		expect(toasts[1].style.zIndex).toBe('801');
		expect(toasts[0].style.getPropertyValue('--z-notification-motion-index')).toBe('1');
		expect(toasts[1].style.getPropertyValue('--z-notification-motion-index')).toBe('2');
		expect(toasts[0].style.getPropertyValue('--z-notification-motion-direction')).toBe('1');
		expect(toasts[1].style.getPropertyValue('--z-notification-motion-direction')).toBe('1');

		rectSpy.mockRestore();
	});

	it('keeps top and bottom notification stacks independent', () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Save';
		document.body.append(trigger);

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
				const height = this.classList.contains('z-notification') ? 40 : 20;
				return {
					x: 0,
					y: 0,
					top: 0,
					left: 0,
					right: 100,
					bottom: height,
					width: 100,
					height,
					toJSON: () => ({}),
				} as DOMRect;
			});

		notification.show({
			element: trigger,
			message: 'Bottom toast.',
			status: 'success',
			position: 'bottom',
		});
		notification.show({
			element: trigger,
			message: 'Top toast.',
			status: 'info',
			position: 'top',
		});

		const bottomToast = screen
			.getByText('Bottom toast.')
			.closest('.z-notification') as HTMLElement;
		const topToast = screen.getByText('Top toast.').closest('.z-notification') as HTMLElement;

		expect(bottomToast.classList.contains('z-notification--bottom')).toBe(true);
		expect(topToast.classList.contains('z-notification--top')).toBe(true);
		expect(bottomToast.style.bottom).toContain('calc(24px');
		expect(bottomToast.style.top).toBe('auto');
		expect(topToast.style.top).toContain('calc(24px');
		expect(topToast.style.bottom).toBe('auto');

		rectSpy.mockRestore();
	});

	it('removes inline notifications after the configured timeout', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await vi.advanceTimersByTimeAsync(50);
		await showInlinePromise;

		expect(screen.getByRole('status')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(screen.queryByRole('status')).toBeNull();
	});

	it('removes inline notifications on outside pointer interaction', async () => {
		const trigger = document.createElement('button');
		const outside = document.createElement('button');
		trigger.textContent = 'Copy link';
		outside.textContent = 'Outside';
		document.body.append(trigger, outside);

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await vi.advanceTimersByTimeAsync(50);
		await showInlinePromise;

		outside.dispatchEvent(new Event('pointerup', { bubbles: true }));

		expect(screen.queryByRole('status')).toBeNull();
	});

	it('removes inline notifications after a large scroll delta', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await vi.advanceTimersByTimeAsync(50);
		await showInlinePromise;

		Object.defineProperty(window, 'scrollY', {
			configurable: true,
			value: 150,
		});

		document.dispatchEvent(new Event('scroll'));

		expect(screen.queryByRole('status')).toBeNull();
	});

	it('removes bottom notifications after the configured timeout', async () => {
		const message = 'Publishing failed. Check the form and try again.';

		notification.show({
			message,
			status: 'error',
			hasTimer: true,
		});

		expect(screen.getByText(message)).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(screen.queryByText(message)).toBeNull();
	});

	it('pauses and resumes the bottom notification timeout on pointer hover', async () => {
		const message = 'Publishing failed. Check the form and try again.';

		notification.show({
			message,
			status: 'error',
			hasTimer: true,
		});

		const notificationMessage = screen.getByText(message);
		const notificationElement = notificationMessage.closest(
			'.z-notification',
		) as HTMLElement | null;
		expect(notificationElement).not.toBeNull();

		await vi.advanceTimersByTimeAsync(2000);
		notificationElement?.dispatchEvent(new Event('pointerenter'));
		await vi.advanceTimersByTimeAsync(4000);

		expect(screen.getByText(message)).toBe(notificationMessage);

		notificationElement?.dispatchEvent(new Event('pointerleave'));
		await vi.advanceTimersByTimeAsync(1999);
		expect(screen.getByText(message)).toBe(notificationMessage);

		await vi.advanceTimersByTimeAsync(1);
		expect(screen.queryByText(message)).toBeNull();
	});

	it('invokes the action callback and removes the notification on click', async () => {
		const onClick = vi.fn();
		const trigger = document.createElement('button');
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});
		const message = 'Publishing failed. Check the form and try again.';
		trigger.textContent = 'Open notification';
		document.body.append(trigger);
		trigger.focus();

		notification.show({
			element: trigger,
			message,
			status: 'error',
			button: {
				text: 'Retry',
				onClick,
			},
		});

		await user.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(screen.queryByText(message)).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('removes bottom notifications when the close button is clicked', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Open notification';
		document.body.append(trigger);
		trigger.focus();

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		notification.show({
			element: trigger,
			message: 'A new version of notification is available.',
			status: 'info',
			link: {
				text: 'Open docs',
				href: 'https://example.com/docs',
			},
		});

		await user.click(screen.getByRole('button', { name: 'Meldung schließen' }));

		expect(screen.queryByText('A new version of notification is available.')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('keeps only the most recent maxNotifications bottom notifications', async () => {
		notification.show({ message: 'First notification', status: 'info' });
		notification.show({ message: 'Second notification', status: 'info' });
		notification.show({ message: 'Third notification', status: 'info' });
		notification.show({ message: 'Fourth notification', status: 'info' });

		expect(screen.queryAllByText(/notification$/)).toHaveLength(3);
		expect(screen.queryByText('First notification')).toBeNull();
		expect(screen.getByText('Second notification')).not.toBeNull();
		expect(screen.getByText('Third notification')).not.toBeNull();
		expect(screen.getByText('Fourth notification')).not.toBeNull();
	});

	it('renders top-positioned notifications with an icon when a matching symbol exists', async () => {
		document.body.innerHTML = `
			<svg aria-hidden="true">
				<symbol id="svg-info" viewBox="0 0 18 18"></symbol>
			</svg>`;

		notification.show({
			position: 'top',
			icon: 'info',
			message: 'Heads up.',
			status: 'info',
		});

		const container = document.querySelector('.z-notification');
		const icon = document.querySelector('.z-notification__icon');

		expect(container?.className).toContain('z-notification--top');
		expect(icon).not.toBeNull();
	});

	it('renders a notification displaying users an error message', async () => {
		notification.show({
			message: 'This is an error notification.',
			status: 'error',
		});
		const container = document.querySelector('.z-notification');
		expect(container?.className).toContain('z-notification--error');
	});

	it('renders notification with timer', async () => {
		notification.show({
			message: 'This is an error notification with timer.',
			status: 'error',
			hasTimer: true,
		});
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		expect(closeButton.className).toContain('z-notification__close-btn--timer');
	});

	it('renders notification without timer being visible permanently', async () => {
		notification.show({
			message: 'This is an error notification without timer.',
			status: 'error',
			hasTimer: false,
		});
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		expect(closeButton?.className).not.toContain('z-notification__close-btn--timer');
	});

	it('replaces a notification with the same type', async () => {
		notification.show({
			type: 'foo',
			message: 'First foo notification',
		});

		expect(screen.getByText('First foo notification')).not.toBeNull();

		notification.show({
			type: 'foo',
			message: 'Second foo notification',
		});

		expect(screen.queryByText('First foo notification')).toBeNull();
		expect(screen.getByText('Second foo notification')).not.toBeNull();
	});

	it('does not replace notifications with different types', async () => {
		notification.show({
			type: 'foo',
			message: 'Foo notification',
		});

		notification.show({
			type: 'share',
			message: 'Share notification',
		});

		expect(screen.getByText('Foo notification')).not.toBeNull();
		expect(screen.getByText('Share notification')).not.toBeNull();
	});
});
