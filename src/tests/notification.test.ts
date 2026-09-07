import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

import {
	GAP_STACKING,
	MAX_NOTIFICATIONS_PER_POSITION,
	Notification,
	NOTIFICATION_ACTION_EVENT,
	NOTIFICATION_REMOVED_EVENT,
	NOTIFICATION_SHOWN_EVENT,
	OFFSET,
} from '../notification';

const ensurePopoverMethods = (): void => {
	if (!HTMLElement.prototype.showPopover) {
		HTMLElement.prototype.showPopover = function showPopover(): void {
			this.toggleAttribute('open', true);
			this.style.display = 'flex';
		};
	}

	if (!HTMLElement.prototype.hidePopover) {
		HTMLElement.prototype.hidePopover = function hidePopover(): void {
			this.removeAttribute('open');
			this.style.display = '';
		};
	}
};

const expectOffset = (value: string, expectedOffset: number): void => {
	expect(value).toContain(`${expectedOffset}px`);
};

const getNotificationMessage = (message: string): HTMLElement => {
	const element = Array.from(document.querySelectorAll('.z-notification__message')).find(
		item => item.textContent === message,
	) as HTMLElement | undefined;
	if (!element) {
		throw new Error(`Expected visible notification message "${message}"`);
	}
	return element;
};

const queryNotificationMessage = (message: string): HTMLElement | null =>
	(Array.from(document.querySelectorAll('.z-notification__message')).find(
		item => item.textContent === message,
	) as HTMLElement | undefined) ?? null;

const getLiveRegion = (politeness: 'polite' | 'assertive'): HTMLElement => {
	const liveRegion = document.querySelector(
		`.z-notification-live-region--${politeness}`,
	) as HTMLElement | null;
	if (!liveRegion) {
		throw new Error(`Expected ${politeness} notification live region`);
	}
	return liveRegion;
};

describe('notification accessibility behavior', () => {
	let notification: Notification;

	beforeEach(() => {
		ensurePopoverMethods();
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

	it('keeps focus on the trigger and queues inline messages in the polite live region', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);
		trigger.focus();

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await showInlinePromise;

		const inlineMessage = document.querySelector('.z-notification-inline');

		expect(document.activeElement).toBe(trigger);
		expect(inlineMessage).not.toBeNull();
		expect(inlineMessage?.getAttribute('role')).toBeNull();
		expect(inlineMessage?.getAttribute('aria-live')).toBeNull();
		expect(inlineMessage?.getAttribute('aria-atomic')).toBeNull();
		expect((inlineMessage as HTMLElement | null)?.innerText).toBe('Link copied to clipboard.');

		await vi.advanceTimersByTimeAsync(50);
		const liveRegion = getLiveRegion('polite');
		expect(liveRegion.getAttribute('role')).toBe('status');
		expect(liveRegion.getAttribute('aria-live')).toBe('polite');
		expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
		expect(liveRegion.textContent).toBe('Link copied to clipboard.');
	});

	it('keeps top-right notification controls in rendered keyboard order and exposes an assertive live message', async () => {
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
		const notificationMessage = getNotificationMessage(message);
		const closeButton = screen.getByRole('button', { name: 'Meldung schließen' });
		const actionButton = screen.getByRole('button', { name: 'Retry' });

		expect(notificationMessage).not.toBeNull();
		expect(notificationMessage.textContent).toBe(message);

		await user.tab();
		expect(document.activeElement).toBe(actionButton);

		await user.tab();
		expect(document.activeElement).toBe(closeButton);
	});

	it('allows keyboard navigation to link actions in top-right notifications', async () => {
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

	it('inserts anchored top-right notifications next to the triggering element', async () => {
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
		expect(container?.getAttribute('popover')).toBe('manual');
		expect(container?.classList.contains('z-notification--top-right')).toBe(true);
		expect(container?.nodeName).toBe('DIV');
		expect(screen.getByText(message)).not.toBeNull();
	});

	it('stacks multiple anchored top-right notifications by index', () => {
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

		const notifications = Array.from(
			document.querySelectorAll('.z-notification'),
		) as HTMLElement[];
		expect(notifications).toHaveLength(2);

		const n1 = notifications[0];
		const n2 = notifications[1];

		expectOffset(n1.style.top, OFFSET + 40 + GAP_STACKING);
		expectOffset(n1.style.right, OFFSET);
		expectOffset(n2.style.top, OFFSET);
		expectOffset(n2.style.right, OFFSET);

		expect(trigger.nextElementSibling).toBe(n1);
		expect(n1.nextElementSibling).toBe(n2);
		expect(n1.style.top).not.toBe(n2.style.top);

		rectSpy.mockRestore();
	});

	it('keeps stacks separate across top-right, top, and bottom positions', () => {
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
			message: 'Top-right notification.',
			status: 'info',
		});
		notification.show({
			message: 'Top notification.',
			position: 'top',
			status: 'info',
		});
		notification.show({
			message: 'Bottom notification.',
			position: 'bottom',
			status: 'info',
		});

		const toasts = Array.from(document.querySelectorAll('.z-notification')) as HTMLElement[];

		expect(toasts).toHaveLength(3);
		expect(toasts[0].className).toContain('z-notification--top-right');
		expectOffset(toasts[0].style.top, OFFSET);
		expectOffset(toasts[0].style.right, OFFSET);
		expect(toasts[1].className).toContain('z-notification--top');
		expectOffset(toasts[1].style.top, OFFSET);
		expect(toasts[1].style.right).toBe('0px');
		expect(toasts[2].className).toContain('z-notification--bottom');
		expectOffset(toasts[2].style.bottom, OFFSET);

		rectSpy.mockRestore();
	});

	it('removes inline notifications after the configured timeout', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);
		notification.notificationTimeout = 5000;

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await showInlinePromise;

		expect(document.querySelector('.z-notification-inline')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(document.querySelector('.z-notification-inline')).toBeNull();
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

		await showInlinePromise;

		outside.dispatchEvent(new Event('pointerup', { bubbles: true }));

		expect(document.querySelector('.z-notification-inline')).toBeNull();
	});

	it('removes inline notifications after a large scroll delta', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);

		const showInlinePromise = notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});

		await showInlinePromise;

		Object.defineProperty(window, 'scrollY', {
			configurable: true,
			value: 150,
		});

		document.dispatchEvent(new Event('scroll'));

		expect(document.querySelector('.z-notification-inline')).toBeNull();
	});

	it('removes top-right notifications after the configured timeout', async () => {
		const message = 'Publishing failed. Check the form and try again.';
		notification.notificationTimeout = 5000;

		notification.show({
			message,
			status: 'error',
			hasTimer: true,
		});

		expect(getNotificationMessage(message)).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(queryNotificationMessage(message)).toBeNull();
	});

	it('pauses and resumes the top-right notification timeout on pointer hover', async () => {
		const message = 'Publishing failed. Check the form and try again.';
		const elapsedBeforePause = 2000;
		notification.notificationTimeout = 5000;

		notification.show({
			message,
			status: 'error',
			hasTimer: true,
		});

		const notificationMessage = getNotificationMessage(message);
		const notificationElement = notificationMessage.closest(
			'.z-notification',
		) as HTMLElement | null;
		expect(notificationElement).not.toBeNull();

		await vi.advanceTimersByTimeAsync(elapsedBeforePause);
		notificationElement?.dispatchEvent(new Event('pointerenter'));
		await vi.advanceTimersByTimeAsync(4000);

		expect(getNotificationMessage(message)).toBe(notificationMessage);

		notificationElement?.dispatchEvent(new Event('pointerleave'));
		await vi.advanceTimersByTimeAsync(
			notification.notificationTimeout - elapsedBeforePause - 1,
		);
		expect(getNotificationMessage(message)).toBe(notificationMessage);

		await vi.advanceTimersByTimeAsync(1);
		expect(queryNotificationMessage(message)).toBeNull();
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
		expect(screen.queryByText(message)).not.toBeNull();

		await user.click(screen.getByRole('button', { name: 'Retry', hidden: true }));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(screen.queryByText(message)).toBeNull();
		// focus back to trigger element
		expect(document.activeElement).toBe(trigger);
	});

	it('removes top-right notifications when the close button is clicked', async () => {
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

		await user.click(screen.getByRole('button', { name: 'Meldung schließen', hidden: true }));

		expect(screen.queryByText('A new version of notification is available.')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('keeps only the most recent maxNotifications top-right notifications', async () => {
		notification.show({ message: 'First notification', status: 'info' });
		notification.show({ message: 'Second notification', status: 'info' });
		notification.show({ message: 'Third notification', status: 'info' });
		notification.show({ message: 'Fourth notification', status: 'info' });

		expect(screen.queryAllByText(/notification$/)).toHaveLength(MAX_NOTIFICATIONS_PER_POSITION);
		expect(screen.queryByText('First notification')).toBeNull();
		expect(screen.getByText('Second notification')).not.toBeNull();
		expect(screen.getByText('Third notification')).not.toBeNull();
		expect(screen.getByText('Fourth notification')).not.toBeNull();
	});

	it('reflows a stack only once when overflow removes the oldest notification', () => {
		const reflowSpy = vi.spyOn(notification, 'positionNotifications');

		notification.show({ message: 'First notification', status: 'info' });
		notification.show({ message: 'Second notification', status: 'info' });
		notification.show({ message: 'Third notification', status: 'info' });
		notification.show({ message: 'Fourth notification', status: 'info' });

		expect(reflowSpy).toHaveBeenCalledTimes(4);
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

	it('renders top-positioned notifications with the top placement class', () => {
		notification.show({
			position: 'top',
			message: 'Top notification.',
			status: 'info',
		});

		const container = document.querySelector('.z-notification') as HTMLElement | null;

		expect(container?.className).toContain('z-notification--top');
		expectOffset(container?.style.top ?? '', OFFSET);
		expect(container?.style.bottom).toBe('auto');
	});

	it('renders bottom-positioned notifications with the bottom placement class', () => {
		notification.show({
			position: 'bottom',
			message: 'Bottom notification.',
			status: 'info',
		});

		const container = document.querySelector('.z-notification') as HTMLElement | null;

		expect(container?.className).toContain('z-notification--bottom');
		expectOffset(container?.style.bottom ?? '', OFFSET);
		expect(container?.style.top).toBe('auto');
	});

	it('stacks top notifications independently up to the maximum per position', () => {
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

		notification.show({ message: 'Top 1', position: 'top', status: 'info' });
		notification.show({ message: 'Top 2', position: 'top', status: 'info' });
		notification.show({ message: 'Top 3', position: 'top', status: 'info' });
		notification.show({ message: 'Top 4', position: 'top', status: 'info' });

		const toasts = Array.from(document.querySelectorAll('.z-notification')) as HTMLElement[];

		expect(toasts).toHaveLength(MAX_NOTIFICATIONS_PER_POSITION);
		expect(screen.queryByText('Top 1')).toBeNull();
		expect(screen.getByText('Top 2')).not.toBeNull();
		expect(screen.getByText('Top 3')).not.toBeNull();
		expect(screen.getByText('Top 4')).not.toBeNull();
		expectOffset(toasts[0].style.top, OFFSET + (40 + GAP_STACKING) * 2);
		expectOffset(toasts[1].style.top, OFFSET + 40 + GAP_STACKING);
		expectOffset(toasts[2].style.top, OFFSET);
		expect(toasts[0].style.top).not.toBe(toasts[1].style.top);
		expect(toasts[1].style.top).not.toBe(toasts[2].style.top);

		rectSpy.mockRestore();
	});

	it('stacks bottom notifications independently up to the maximum per position', () => {
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

		notification.show({ message: 'Bottom 1', position: 'bottom', status: 'info' });
		notification.show({ message: 'Bottom 2', position: 'bottom', status: 'info' });
		notification.show({ message: 'Bottom 3', position: 'bottom', status: 'info' });
		notification.show({ message: 'Bottom 4', position: 'bottom', status: 'info' });

		const toasts = Array.from(document.querySelectorAll('.z-notification')) as HTMLElement[];

		expect(toasts).toHaveLength(MAX_NOTIFICATIONS_PER_POSITION);
		expect(screen.queryByText('Bottom 1')).toBeNull();
		expect(screen.getByText('Bottom 2')).not.toBeNull();
		expect(screen.getByText('Bottom 3')).not.toBeNull();
		expect(screen.getByText('Bottom 4')).not.toBeNull();
		expectOffset(toasts[0].style.bottom, OFFSET + (40 + GAP_STACKING) * 2);
		expectOffset(toasts[1].style.bottom, OFFSET + 40 + GAP_STACKING);
		expectOffset(toasts[2].style.bottom, OFFSET);
		expect(toasts[0].style.bottom).not.toBe(toasts[1].style.bottom);
		expect(toasts[1].style.bottom).not.toBe(toasts[2].style.bottom);

		rectSpy.mockRestore();
	});

	it('renders top-right notifications with a right offset and icon when a matching symbol exists', async () => {
		document.body.innerHTML = `
			<svg aria-hidden="true">
				<symbol id="svg-info" viewBox="0 0 18 18"></symbol>
			</svg>`;

		notification.show({
			icon: 'info',
			message: 'Foo.',
			status: 'info',
		});

		const container = document.querySelector('.z-notification') as HTMLElement | null;
		const icon = document.querySelector('.z-notification__icon');

		expect(container?.className).toContain('z-notification--top-right');
		expectOffset(container?.style.right ?? '', OFFSET);
		expect(container?.style.left).toBe('auto');
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
		notification.notificationTimeout = 5000;

		notification.show({
			message: 'This is an error notification with timer.',
			status: 'error',
			hasTimer: true,
		});
		const closeButton = screen.getByRole('button', {
			name: 'Meldung schließen',
			hidden: true,
		}) as HTMLButtonElement;
		expect(closeButton.className).toContain('z-notification__close-btn--timer');
	});

	it('renders notification without timer being visible permanently', async () => {
		notification.show({
			message: 'This is an error notification without timer.',
			status: 'error',
			hasTimer: false,
		});
		const closeButton = screen.getByRole('button', {
			name: 'Meldung schließen',
			hidden: true,
		}) as HTMLButtonElement;
		expect(closeButton?.className).not.toContain('z-notification__close-btn--timer');
	});

	it('replaces a notification with the same group', async () => {
		notification.show({
			group: 'foo',
			message: 'First foo notification',
		});

		expect(screen.getByText('First foo notification')).not.toBeNull();

		notification.show({
			group: 'foo',
			message: 'Second foo notification',
		});

		expect(screen.queryByText('First foo notification')).toBeNull();
		expect(screen.getByText('Second foo notification')).not.toBeNull();
	});

	it('replaces notifications with the same group only within the same position stack', async () => {
		notification.show({
			group: 'foo',
			position: 'top',
			message: 'Top foo notification',
		});

		notification.show({
			group: 'foo',
			position: 'bottom',
			message: 'Bottom foo notification',
		});

		notification.show({
			group: 'foo',
			position: 'top',
			message: 'Replacement top foo notification',
		});

		expect(screen.queryByText('Top foo notification')).toBeNull();
		expect(screen.getByText('Replacement top foo notification')).not.toBeNull();
		expect(screen.getByText('Bottom foo notification')).not.toBeNull();
		expect(document.querySelectorAll('.z-notification')).toHaveLength(2);
	});

	it('does not replace notifications with different groups', async () => {
		notification.show({
			group: 'foo',
			message: 'Foo notification',
		});

		notification.show({
			group: 'share',
			message: 'Share notification',
		});

		expect(screen.getByText('Foo notification')).not.toBeNull();
		expect(screen.getByText('Share notification')).not.toBeNull();
	});

	it('calls onClose callback when timer expires', async () => {
		const onCloseMock = vi.fn();
		notification.notificationTimeout = 5000;

		notification.show({
			message: 'Notification with onClose',
			status: 'info',
			hasTimer: true,
			onClose: onCloseMock,
		});

		expect(onCloseMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(onCloseMock).toHaveBeenCalledTimes(1);
	});

	it('dispatches notification-removed with the notification when timer expires', async () => {
		const eventListener = vi.fn((event: CustomEvent) => {
			expect(event.detail.notification.isConnected).toBe(true);
		});
		notification.notificationTimeout = 5000;

		window.addEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);

		notification.show({
			message: 'Notification with removal event',
			status: 'info',
			hasTimer: true,
		});

		const notificationElement = getNotificationMessage(
			'Notification with removal event',
		).closest('.z-notification');

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as CustomEvent;
		expect(event.detail.originator).toBe(document.body);
		expect(event.detail.notification).toBe(notificationElement);
		expect(event.detail.notification.isConnected).toBe(false);

		window.removeEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);
	});

	it('does not restore focus to the trigger when timer expires', async () => {
		const trigger = document.createElement('button');
		const nextFocusTarget = document.createElement('button');

		notification.notificationTimeout = 5000;
		trigger.textContent = 'Open notification';
		nextFocusTarget.textContent = 'Keep focus here';
		document.body.append(trigger, nextFocusTarget);
		trigger.focus();

		notification.show({
			element: trigger,
			message: 'Notification with timer',
			status: 'info',
			hasTimer: true,
		});
		nextFocusTarget.focus();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(queryNotificationMessage('Notification with timer')).toBeNull();
		expect(document.activeElement).toBe(nextFocusTarget);
	});

	it('restores focus to the trigger when timer expires while focus is inside the notification', async () => {
		const trigger = document.createElement('button');

		notification.notificationTimeout = 5000;
		trigger.textContent = 'Open notification';
		document.body.append(trigger);
		trigger.focus();

		notification.show({
			element: trigger,
			message: 'Notification with focused close button',
			status: 'info',
			hasTimer: true,
		});
		const closeButton = screen.getByRole('button', {
			name: 'Meldung schließen',
			hidden: true,
		});
		closeButton.focus();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		expect(queryNotificationMessage('Notification with focused close button')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('calls onClose callback when closed manually', async () => {
		const onCloseMock = vi.fn();

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		notification.show({
			message: 'Notification with onClose manual',
			status: 'info',
			hasTimer: true,
			onClose: onCloseMock,
		});

		await user.click(screen.getByRole('button', { name: 'Meldung schließen', hidden: true }));

		expect(onCloseMock).toHaveBeenCalledTimes(1);
	});

	it('dispatches notification-removed with the notification when closed manually', async () => {
		const trigger = document.createElement('button');
		const eventListener = vi.fn((event: CustomEvent) => {
			expect(event.detail.notification.isConnected).toBe(true);
		});
		trigger.textContent = 'Open notification';
		document.body.append(trigger);

		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		window.addEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);

		notification.show({
			element: trigger,
			message: 'Notification with manual removal event',
			status: 'info',
		});

		const notificationElement = getNotificationMessage(
			'Notification with manual removal event',
		).closest('.z-notification');

		await user.click(screen.getByRole('button', { name: 'Meldung schließen', hidden: true }));

		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as CustomEvent;
		expect(event.detail.originator).toBe(trigger);
		expect(event.detail.notification).toBe(notificationElement);
		expect(event.detail.notification.isConnected).toBe(false);

		window.removeEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);
	});

	it('dispatches notification-removed when an action button closes the notification', async () => {
		const eventListener = vi.fn();
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime,
		});

		window.addEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);

		notification.show({
			message: 'Notification with action removal event',
			status: 'info',
			button: {
				text: 'Confirm',
				onClick: vi.fn(),
			},
		});

		const notificationElement = getNotificationMessage(
			'Notification with action removal event',
		).closest('.z-notification');

		await user.click(screen.getByRole('button', { name: 'Confirm', hidden: true }));

		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as CustomEvent;
		expect(event.detail.originator).toBe(document.body);
		expect(event.detail.notification).toBe(notificationElement);

		window.removeEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);
	});

	it('does not call onClose when notification is replaced by same group', async () => {
		const onCloseMock = vi.fn();
		const eventListener = vi.fn();

		window.addEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);

		notification.show({
			group: 'test-group',
			message: 'First notification',
			status: 'info',
			hasTimer: true,
			onClose: onCloseMock,
		});

		await vi.advanceTimersByTimeAsync(1000);

		notification.show({
			group: 'test-group',
			message: 'Second notification',
			status: 'info',
			hasTimer: true,
		});

		// First notification was replaced, onClose should not have been called
		expect(onCloseMock).not.toHaveBeenCalled();
		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as CustomEvent;
		expect(event.detail.notification.textContent).toContain('First notification');
		expect(queryNotificationMessage('First notification')).toBeNull();
		expect(getNotificationMessage('Second notification')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(notification.notificationTimeout);

		// Still not called since first was replaced
		expect(onCloseMock).not.toHaveBeenCalled();

		window.removeEventListener(NOTIFICATION_REMOVED_EVENT, eventListener);
	});

	it('shows a companion notification when settings.url is provided', () => {
		notification.show({
			message: 'Article saved.',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		expect(document.querySelectorAll('.z-notification')).toHaveLength(2);
		expect(screen.getByText('Automatisch ausblenden?')).not.toBeNull();
	});

	it('replaces the companion message and removes the button when Konfigurieren is clicked', async () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

		notification.show({
			message: 'Article saved.',
			status: 'success',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		await user.click(screen.getByRole('button', { name: 'Konfigurieren', hidden: true }));

		expect(screen.getByText('Neuer Tab wird geöffnet …')).not.toBeNull();
		expect(screen.queryByRole('button', { name: 'Konfigurieren', hidden: true })).toBeNull();

		await vi.advanceTimersByTimeAsync(2000);
		expect(openSpy).toHaveBeenCalledWith(
			'https://example.com/settings',
			'_blank',
			'noopener,noreferrer',
		);
		expect(screen.queryByText('Neuer Tab wird geöffnet …')).toBeNull();

		openSpy.mockRestore();
	});

	it('uses custom settings copy when provided', async () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

		notification.show({
			message: 'Article saved.',
			status: 'success',
			hasTimer: true,
			settings: {
				url: 'https://example.com/settings',
				message: 'Auto close?',
				buttonText: 'Configure',
				openingMessage: 'Opening settings tab...',
			},
		});

		screen.getByText('Auto close?');

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		await user.click(screen.getByRole('button', { name: 'Configure', hidden: true }));

		screen.getByText('Opening settings tab...');
		expect(screen.queryByRole('button', { name: 'Configure', hidden: true })).toBeNull();

		await vi.advanceTimersByTimeAsync(2000);
		expect(openSpy).toHaveBeenCalledWith(
			'https://example.com/settings',
			'_blank',
			'noopener,noreferrer',
		);
		expect(screen.queryByText('Opening settings tab...')).toBeNull();

		openSpy.mockRestore();
	});

	it('does not show a companion notification when a stored duration already exists', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('3000');

		notification.show({
			message: 'Article saved.',
			status: 'success',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		expect(document.querySelectorAll('.z-notification')).toHaveLength(1);
		expect(screen.queryByText('Automatisch ausblenden')).toBeNull();
	});

	it('resets a stale stored duration when a later notification has no stored duration', async () => {
		vi.spyOn(Storage.prototype, 'getItem')
			.mockReturnValueOnce('3000')
			.mockReturnValueOnce(null);

		notification.show({
			message: 'First saved article.',
			status: 'success',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		await vi.advanceTimersByTimeAsync(3000);
		expect(queryNotificationMessage('First saved article.')).toBeNull();

		notification.show({
			message: 'Second saved article.',
			status: 'success',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		expect(document.querySelectorAll('.z-notification')).toHaveLength(2);
		expect(screen.getByText('Automatisch ausblenden?')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(3000);
		expect(getNotificationMessage('Second saved article.')).not.toBeNull();
	});
});

describe('notification lifecycle events', () => {
	let notification: Notification;
	const listeners: Array<[string, EventListener]> = [];

	const listenTo = (eventName: string): ReturnType<typeof vi.fn> => {
		const listener = vi.fn();
		window.addEventListener(eventName, listener);
		listeners.push([eventName, listener as unknown as EventListener]);
		return listener;
	};

	const detailOf = (listener: ReturnType<typeof vi.fn>, call = 0) =>
		(listener.mock.calls[call][0] as CustomEvent).detail;

	beforeEach(() => {
		ensurePopoverMethods();
		Notification.instance = undefined;
		document.body.innerHTML = '';
		vi.useFakeTimers();
		notification = new Notification();
	});

	afterEach(() => {
		listeners.forEach(([eventName, listener]) =>
			window.removeEventListener(eventName, listener),
		);
		listeners.length = 0;
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		document.body.innerHTML = '';
		Notification.instance = undefined;
	});

	it('returns the notification element from show()', () => {
		const trigger = document.createElement('button');
		document.body.append(trigger);

		const element = notification.show({
			element: trigger,
			group: 'bookmark',
			message: 'Article saved.',
			status: 'success',
		});

		expect(element).toBe(getNotificationMessage('Article saved.').closest('.z-notification'));
		expect(element.group).toBe('bookmark');
		expect(element.status).toBe('success');
		expect(element.anchorElement).toBe(trigger);
	});

	it('dispatches notification-shown once the notification is in the DOM', () => {
		const trigger = document.createElement('button');
		document.body.append(trigger);
		const shown = listenTo(NOTIFICATION_SHOWN_EVENT);

		const element = notification.show({
			element: trigger,
			group: 'bookmark',
			message: 'Article saved.',
			status: 'success',
		});

		expect(shown).toHaveBeenCalledTimes(1);
		const detail = detailOf(shown);
		expect(detail.notification).toBe(element);
		expect(detail.notification.isConnected).toBe(true);
		expect(detail.originator).toBe(trigger);
		expect(detail.group).toBe('bookmark');
		expect(detail.status).toBe('success');
		expect(detail.hasTimer).toBe(false);
		expect(detail.duration).toBeUndefined();
		expect(detail.isCompanion).toBe(false);
	});

	it('reports the effective timer duration, not the stored preference', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('3000');
		const shown = listenTo(NOTIFICATION_SHOWN_EVENT);

		notification.show({ message: 'With timer', hasTimer: true });
		notification.show({ message: 'Without timer' });

		expect(detailOf(shown, 0).hasTimer).toBe(true);
		expect(detailOf(shown, 0).duration).toBe(3000);
		expect(detailOf(shown, 1).hasTimer).toBe(false);
		expect(detailOf(shown, 1).duration).toBeUndefined();
	});

	it('reports no active timer when nothing configured a duration', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
		const shown = listenTo(NOTIFICATION_SHOWN_EVENT);

		notification.show({ message: 'No stored duration', hasTimer: true });

		expect(detailOf(shown).hasTimer).toBe(false);
		expect(detailOf(shown).duration).toBeUndefined();
	});

	it('echoes the opaque data option back in every lifecycle event', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const shown = listenTo(NOTIFICATION_SHOWN_EVENT);
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);
		const data = { layout: 'bookmark_link_timer' };

		const element = notification.show({ message: 'With data', data });

		expect(element.data).toBe(data);
		expect(detailOf(shown).data).toBe(data);

		await user.click(screen.getByRole('button', { name: 'Meldung schließen', hidden: true }));

		expect(detailOf(removed).data).toBe(data);
	});

	it('dispatches notification-action for a callback button', async () => {
		const onClick = vi.fn();
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const action = listenTo(NOTIFICATION_ACTION_EVENT);
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		const element = notification.show({
			message: 'Article removed.',
			button: { text: 'Rückgängig', onClick },
		});

		expect(element.actionType).toBe('button');

		await user.click(screen.getByRole('button', { name: 'Rückgängig', hidden: true }));

		expect(action).toHaveBeenCalledTimes(1);
		expect(detailOf(action).notification).toBe(element);
		expect(detailOf(action).actionType).toBe('button');
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(detailOf(removed).reason).toBe('action');
	});

	it('dispatches notification-action for a link without removing the notification', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const action = listenTo(NOTIFICATION_ACTION_EVENT);
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		const element = notification.show({
			message: 'Article saved.',
			link: { text: 'Zur Merkliste', href: 'https://example.com/merkliste' },
		});

		expect(element.actionType).toBe('link');

		const link = screen.getByRole('link', { name: 'Zur Merkliste', hidden: true });
		link.addEventListener('click', event => event.preventDefault());
		await user.click(link);

		expect(action).toHaveBeenCalledTimes(1);
		expect(detailOf(action).actionType).toBe('link');
		expect(removed).not.toHaveBeenCalled();
	});

	it('dispatches notification-action for the auto-dismiss hint', async () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const shown = listenTo(NOTIFICATION_SHOWN_EVENT);
		const action = listenTo(NOTIFICATION_ACTION_EVENT);

		notification.show({
			message: 'Article saved.',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		expect(shown).toHaveBeenCalledTimes(2);
		expect(detailOf(shown, 0).isCompanion).toBe(false);
		expect(detailOf(shown, 1).isCompanion).toBe(true);

		await user.click(screen.getByRole('button', { name: 'Konfigurieren', hidden: true }));

		expect(action).toHaveBeenCalledTimes(1);
		expect(detailOf(action).isCompanion).toBe(true);
		expect(screen.getByText('Neuer Tab wird geöffnet …')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(2000);
		expect(openSpy).toHaveBeenCalledTimes(1);

		openSpy.mockRestore();
	});

	it('reports reason "close" when the user clicks the close button', async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		notification.show({ message: 'Closed by hand' });

		await user.click(screen.getByRole('button', { name: 'Meldung schließen', hidden: true }));

		expect(detailOf(removed).reason).toBe('close');
	});

	it('reports reason "timeout" when the timer expires', async () => {
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);
		notification.notificationTimeout = 5000;

		notification.show({ message: 'Auto dismissed', hasTimer: true });

		await vi.advanceTimersByTimeAsync(5000);

		expect(detailOf(removed).reason).toBe('timeout');
	});

	it('reports reason "replaced" when a newer notification of the same group appears', () => {
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		notification.show({ group: 'bookmark', message: 'First' });
		notification.show({ group: 'bookmark', message: 'Second' });

		expect(removed).toHaveBeenCalledTimes(1);
		expect(detailOf(removed).reason).toBe('replaced');
	});

	it('reports reason "evicted" when the position stack overflows', () => {
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		for (let index = 0; index <= MAX_NOTIFICATIONS_PER_POSITION; index++) {
			notification.show({ message: `Notification ${index}` });
		}

		expect(removed).toHaveBeenCalledTimes(1);
		expect(detailOf(removed).reason).toBe('evicted');
	});

	it('reports reason "cascade" when the hint follows its parent out of the DOM', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		notification.show({
			message: 'Article saved.',
			hasTimer: true,
			settings: { url: 'https://example.com/settings' },
		});

		const closeButtons = screen.getAllByRole('button', {
			name: 'Meldung schließen',
			hidden: true,
		});
		await user.click(closeButtons[0]);

		expect(removed).toHaveBeenCalledTimes(2);
		expect(detailOf(removed, 0).reason).toBe('close');
		expect(detailOf(removed, 0).isCompanion).toBe(false);
		expect(detailOf(removed, 1).reason).toBe('cascade');
		expect(detailOf(removed, 1).isCompanion).toBe(true);
	});

	it('reports reason "programmatic" for removals through the API', () => {
		const removed = listenTo(NOTIFICATION_REMOVED_EVENT);

		const element = notification.show({ message: 'Removed by code' });
		notification.removeNotification(element);

		expect(detailOf(removed).reason).toBe('programmatic');
	});

	it('exposes stable part hooks for consumers', () => {
		const element = notification.show({
			message: 'Article saved.',
			link: { text: 'Zur Merkliste', href: 'https://example.com/merkliste' },
		});

		expect(element.querySelector('[data-notification-part="message"]')).not.toBeNull();
		expect(element.querySelector('[data-notification-part="action"]')?.tagName).toBe('A');
		expect(element.querySelector('[data-notification-part="close"]')).not.toBeNull();
	});
});
