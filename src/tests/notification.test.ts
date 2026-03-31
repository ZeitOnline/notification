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
		notification.show({
			message: 'Publishing failed. Check the form and try again.',
			status: 'error',
			button: {
				text: 'Retry',
				onClick: vi.fn(),
			},
		});

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});
		const alert = screen.getByRole('alert');
		const closeButton = screen.getByRole('button', { name: 'Schließen' });
		const actionButton = screen.getByRole('button', { name: 'Retry' });

		expect(alert.getAttribute('aria-live')).toBe('assertive');
		expect(alert.textContent).toContain('Publishing failed. Check the form and try again.');

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
		const closeButton = screen.getByRole('button', { name: 'Schließen' });
		const actionLink = screen.getByRole('link', { name: 'Open docs' });

		await user.tab();
		expect(document.activeElement).toBe(actionLink);

		await user.tab();
		expect(document.activeElement).toBe(closeButton);
		expect(actionLink.getAttribute('href')).toBe('https://example.com/docs');
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
		notification.show({
			message: 'Publishing failed. Check the form and try again.',
			status: 'error',
			hasTimer: true,
		});

		expect(screen.getByRole('alert')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('pauses and resumes the bottom notification timeout on pointer hover', async () => {
		notification.show({
			message: 'Publishing failed. Check the form and try again.',
			status: 'error',
			hasTimer: true,
		});

		const alert = screen.getByRole('alert');

		await vi.advanceTimersByTimeAsync(2000);
		alert.dispatchEvent(new Event('pointerenter'));
		await vi.advanceTimersByTimeAsync(4000);

		expect(screen.getByRole('alert')).toBe(alert);

		alert.dispatchEvent(new Event('pointerleave'));
		await vi.advanceTimersByTimeAsync(1999);
		expect(screen.getByRole('alert')).toBe(alert);

		await vi.advanceTimersByTimeAsync(1);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('invokes the action callback and removes the notification on click', async () => {
		const onClick = vi.fn();
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		notification.show({
			message: 'Publishing failed. Check the form and try again.',
			status: 'error',
			button: {
				text: 'Retry',
				onClick,
			},
		});

		await user.click(screen.getByRole('button', { name: 'Retry' }));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('removes bottom notifications when the close button is clicked', async () => {
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		notification.show({
			message: 'A new version of notification is available.',
			status: 'info',
			link: {
				text: 'Open docs',
				href: 'https://example.com/docs',
			},
		});

		await user.click(screen.getByRole('button', { name: 'Schließen' }));

		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('keeps only the most recent maxNotifications bottom notifications', async () => {
		notification.show({ message: 'First notification', status: 'info' });
		notification.show({ message: 'Second notification', status: 'info' });
		notification.show({ message: 'Third notification', status: 'info' });
		notification.show({ message: 'Fourth notification', status: 'info' });

		expect(screen.queryAllByRole('alert')).toHaveLength(3);
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
		const container = document.querySelector('.z-notification__item');
		expect(container?.className).toContain('z-notification__item--error');
	});

	it('renders notification with timer', async () => {
		notification.show({
			message: 'This is an error notification with timer.',
			status: 'error',
			hasTimer: true,
		});
		const closeButton = document.querySelector('.z-notification__close-btn');
		expect(closeButton?.className).toContain('z-notification__close-btn--timer');
	});

	it('renders notification without timer being visible permanently', async () => {
		notification.show({
			message: 'This is an error notification without timer.',
			status: 'error',
		});
		const closeButton = document.querySelector('.z-notification__close-btn');
		expect(closeButton?.className).not.toContain('z-notification__close-btn--timer');
	});
});
