import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { virtual } from '@guidepup/virtual-screen-reader';

import { Notification } from '../notification';

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

const waitForAnnouncement = async (delay = 200): Promise<void> => {
	await new Promise(resolve => {
		setTimeout(resolve, delay);
	});
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

const getLiveRegion = (politeness: 'polite' | 'assertive'): HTMLElement => {
	const liveRegion = document.querySelector(
		`.z-notification-live-region--${politeness}`,
	) as HTMLElement | null;
	if (!liveRegion) {
		throw new Error(`Expected ${politeness} notification live region`);
	}
	return liveRegion;
};

describe.sequential('notification spoken accessibility', () => {
	let notification: Notification;

	beforeEach(() => {
		ensurePopoverMethods();
		Notification.instance = undefined;
		document.body.innerHTML = '';
		notification = new Notification();
	});

	afterEach(async () => {
		try {
			await virtual.stop();
		} catch {
			// No-op if the virtual screen reader was not active for this test.
		}
	});

	it('renders inline messages without moving focus away from the trigger', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Copy link';
		document.body.append(trigger);

		await virtual.start({ container: document.body });
		await virtual.interact();

		const user = userEvent.setup();
		await user.tab();

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy link' }));

		await notification.showInline({
			element: trigger,
			message: 'Link copied to clipboard.',
		});
		await waitForAnnouncement();

		const inlineMessage = document.querySelector(
			'.z-notification-inline',
		) as HTMLElement | null;
		const liveRegion = getLiveRegion('polite');

		expect(document.activeElement).toBe(trigger);
		expect(inlineMessage).not.toBeNull();
		expect(inlineMessage?.innerText).toContain('Link copied to clipboard.');
		expect(liveRegion.getAttribute('aria-live')).toBe('polite');
		expect(liveRegion.getAttribute('aria-atomic')).toBe('true');
		expect(liveRegion.textContent).toContain('Link copied to clipboard.');
	});

	it('exposes top-right alerts and speaks the action and close buttons in tab order', async () => {
		await virtual.start({ container: document.body });
		await virtual.interact();

		notification.show({
			message: 'Publishing failed. Check the form and try again.',
			status: 'error',
			button: {
				text: 'Retry',
				onClick: () => undefined,
			},
		});
		await waitForAnnouncement();

		const message = getNotificationMessage('Publishing failed. Check the form and try again.');
		expect(message).not.toBeNull();
		expect(message.textContent).toBe('Publishing failed. Check the form and try again.');

		const user = userEvent.setup();
		await user.tab();

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry' }));
		let spoken = (await virtual.lastSpokenPhrase()).toLowerCase();
		expect(spoken).toContain('retry');
		expect(spoken).toContain('button');

		await user.tab();

		expect(document.activeElement).toBe(
			screen.getByRole('button', { name: 'Meldung schließen' }),
		);
		spoken = (await virtual.lastSpokenPhrase()).toLowerCase();
		expect(spoken).toContain('schließen');
	});

	it('speaks link actions when navigating top-right notifications by keyboard', async () => {
		await virtual.start({ container: document.body });
		await virtual.interact();

		notification.show({
			message: 'A new version of notification is available.',
			status: 'info',
			link: {
				text: 'Open docs',
				href: 'https://example.com/docs',
			},
		});
		await waitForAnnouncement();

		const user = userEvent.setup();
		await user.tab();

		expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Open docs' }));

		let spoken = (await virtual.lastSpokenPhrase()).toLowerCase();
		expect(spoken).toContain('open docs');
		expect(spoken).toContain('link');

		await user.tab();
		expect(document.activeElement).toBe(
			screen.getByRole('button', { name: 'Meldung schließen' }),
		);
	});
});
