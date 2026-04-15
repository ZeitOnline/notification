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
			position: 'bottom',
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
			position: 'bottom',
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

	it('defaults to top notifications when no position is provided', async () => {
		notification.show({
			message: 'Default top notification.',
			status: 'info',
		});

		const container = document.querySelector('.z-notification');

		expect(container?.classList.contains('z-notification--top')).toBe(true);
		expect(container?.style.top).toContain('calc(24px');
		expect(container?.style.bottom).toBe('auto');
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
			position: 'bottom',
		});

		const container = document.querySelector('.z-notification');

		expect(trigger.nextElementSibling).toBe(container);
		expect(document.body.querySelectorAll('.z-notification')).toHaveLength(1);
		expect(document.querySelector('dialog')).toBeNull();
		expect(container?.classList.contains('z-notification--bottom')).toBe(true);
		expect(container?.nodeName).toBe('DIV');
		expect(screen.getByText(message)).not.toBeNull();
	});

	it('stacks multiple anchored bottom notifications with newer notifications below older ones', () => {
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
			position: 'bottom',
		});
		notification.show({
			element: trigger,
			message: 'Second saved toast.',
			status: 'success',
			position: 'bottom',
		});

		const toasts = Array.from(document.querySelectorAll('.z-notification')) as HTMLElement[];

		expect(toasts).toHaveLength(2);
		expect(trigger.nextElementSibling).toBe(toasts[0]);
		expect(toasts[0].nextElementSibling).toBe(toasts[1]);
		expect(toasts[0].style.bottom).toContain('calc(72px');
		expect(toasts[1].style.bottom).toContain('calc(24px');
		expect(toasts[0].style.zIndex).toBe('801');
		expect(toasts[1].style.zIndex).toBe('802');
		expect(toasts[0].style.getPropertyValue('--z-notification-motion-index')).toBe('2');
		expect(toasts[1].style.getPropertyValue('--z-notification-motion-index')).toBe('1');
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

	it('adds the height of a matching offset container to the notification offset', () => {
		const trigger = document.createElement('button');
		const offsetContainer = document.createElement('div');
		trigger.textContent = 'Save';
		offsetContainer.id = 'page-header';
		document.body.append(offsetContainer, trigger);

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
				if (this.id === 'page-header') {
					return {
						x: 0,
						y: 0,
						top: 0,
						left: 0,
						right: 100,
						bottom: 60,
						width: 100,
						height: 60,
						toJSON: () => ({}),
					} as DOMRect;
				}

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
			message: 'Offset toast.',
			status: 'info',
			position: 'bottom',
			offsetFromContainer: '#page-header',
		});

		const toast = screen.getByText('Offset toast.').closest('.z-notification') as HTMLElement;

		expect(toast.style.bottom).toContain('calc(84px');

		rectSpy.mockRestore();
	});

	it('keeps the offset container height when top notifications are repositioned', () => {
		const trigger = document.createElement('button');
		const offsetContainer = document.createElement('div');
		trigger.textContent = 'Save';
		offsetContainer.id = 'page-header';
		document.body.append(offsetContainer, trigger);

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
				if (this.id === 'page-header') {
					return {
						x: 0,
						y: 0,
						top: 0,
						left: 0,
						right: 100,
						bottom: 60,
						width: 100,
						height: 60,
						toJSON: () => ({}),
					} as DOMRect;
				}

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
			position: 'top',
			message: 'First top toast.',
			status: 'info',
			offsetFromContainer: '#page-header',
		});
		notification.show({
			element: trigger,
			position: 'top',
			message: 'Second top toast.',
			status: 'info',
			offsetFromContainer: '#page-header',
		});

		const firstToast = screen
			.getByText('First top toast.')
			.closest('.z-notification') as HTMLElement;
		const secondToast = screen
			.getByText('Second top toast.')
			.closest('.z-notification') as HTMLElement;

		expect(firstToast.style.top).toContain('calc(84px');
		expect(secondToast.style.top).toContain('calc(132px');

		notification.removeNotification(firstToast);

		expect(secondToast.style.top).toContain('calc(84px');

		rectSpy.mockRestore();
	});

	it('updates the notification offset from the visible portion of the container', () => {
		const trigger = document.createElement('button');
		const offsetContainer = document.createElement('div');
		trigger.textContent = 'Save';
		offsetContainer.id = 'page-header';
		document.body.append(offsetContainer, trigger);

		let observerInstance: MockIntersectionObserver | null = null;
		const originalIntersectionObserver = window.IntersectionObserver;
		class MockIntersectionObserver {
			callback: IntersectionObserverCallback;
			constructor(callback: IntersectionObserverCallback) {
				this.callback = callback;
				observerInstance = this;
			}
			observe(): void {}
			disconnect(): void {}
			emit(target: Element, height: number): void {
				this.callback(
					[
						{
							isIntersecting: height > 0,
							intersectionRatio: height > 0 ? 1 : 0,
							intersectionRect: {
								height,
							} as DOMRectReadOnly,
							target,
						} as IntersectionObserverEntry,
					],
					this as unknown as IntersectionObserver,
				);
			}
		}

		Object.defineProperty(window, 'IntersectionObserver', {
			configurable: true,
			value: MockIntersectionObserver,
		});

		const rectSpy = vi
			.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
			.mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
				if (this.id === 'page-header') {
					return {
						x: 0,
						y: 0,
						top: 0,
						left: 0,
						right: 100,
						bottom: 50,
						width: 100,
						height: 50,
						toJSON: () => ({}),
					} as DOMRect;
				}

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

		try {
			notification.show({
				element: trigger,
				position: 'top',
				message: 'Observer toast.',
				status: 'info',
				offsetFromContainer: '#page-header',
			});

			const toast = screen
				.getByText('Observer toast.')
				.closest('.z-notification') as HTMLElement;

			expect(toast.style.top).toContain('calc(74px');

			observerInstance?.emit(offsetContainer, 30);

			expect(toast.style.top).toContain('calc(54px');
		} finally {
			rectSpy.mockRestore();
			Object.defineProperty(window, 'IntersectionObserver', {
				configurable: true,
				value: originalIntersectionObserver,
			});
		}
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
			position: 'bottom',
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
			position: 'bottom',
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
			position: 'bottom',
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
			position: 'bottom',
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
		notification.show({ message: 'First notification', status: 'info', position: 'bottom' });
		notification.show({ message: 'Second notification', status: 'info', position: 'bottom' });
		notification.show({ message: 'Third notification', status: 'info', position: 'bottom' });
		notification.show({ message: 'Fourth notification', status: 'info', position: 'bottom' });

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
			position: 'bottom',
		});
		const container = document.querySelector('.z-notification');
		expect(container?.className).toContain('z-notification--error');
	});

	it('renders notification with timer', async () => {
		notification.show({
			message: 'This is an error notification with timer.',
			status: 'error',
			position: 'bottom',
			hasTimer: true,
		});
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		expect(closeButton.className).toContain('z-notification__close-btn--timer');
	});

	it('renders notification without timer being visible permanently', async () => {
		notification.show({
			message: 'This is an error notification without timer.',
			status: 'error',
			position: 'bottom',
			hasTimer: false,
		});
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		expect(closeButton?.className).not.toContain('z-notification__close-btn--timer');
	});

	it('replaces a notification with the same type and animates the old one as replaced', async () => {
		const originalMatchMedia = window.matchMedia;
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn().mockReturnValue({
				matches: false,
			}),
		});

		try {
			notification.show({
				type: 'foo',
				position: 'bottom',
				message: 'First foo notification',
			});

			const firstNotification = screen
				.getByText('First foo notification')
				.closest('.z-notification') as HTMLElement;
			expect(firstNotification).not.toBeNull();

			notification.show({
				type: 'foo',
				position: 'bottom',
				message: 'Second foo notification',
			});

			const secondNotification = screen
				.getByText('Second foo notification')
				.closest('.z-notification') as HTMLElement;

			expect(firstNotification.classList.contains('z-notification--replaced')).toBe(true);
			expect(firstNotification.classList.contains('z-notification--leaving')).toBe(true);
			expect(secondNotification).not.toBeNull();
			expect(firstNotification.style.bottom).toContain('32px');
			expect(secondNotification.style.bottom).toContain('calc(24px');

			await vi.advanceTimersByTimeAsync(180);

			expect(screen.queryByText('First foo notification')).toBeNull();
			expect(screen.getByText('Second foo notification')).not.toBeNull();
		} finally {
			Object.defineProperty(window, 'matchMedia', {
				configurable: true,
				value: originalMatchMedia,
			});
		}
	});

	it('does not replace notifications with different types', async () => {
		notification.show({
			type: 'foo',
			position: 'bottom',
			message: 'Foo notification',
		});

		notification.show({
			type: 'share',
			position: 'bottom',
			message: 'Share notification',
		});

		expect(screen.getByText('Foo notification')).not.toBeNull();
		expect(screen.getByText('Share notification')).not.toBeNull();
	});
});
