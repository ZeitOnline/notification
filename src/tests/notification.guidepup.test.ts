import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { virtual } from '@guidepup/virtual-screen-reader';

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

const waitForAnnouncement = async (delay = 200): Promise<void> => {
	await new Promise(resolve => {
		setTimeout(resolve, delay);
	});
};

describe.sequential('notification spoken accessibility', () => {
	let notification: Notification;

	beforeEach(() => {
		ensureDialogMethods();
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

		const inlineMessage = screen.getByRole('status');

		expect(document.activeElement).toBe(trigger);
		expect(inlineMessage.getAttribute('aria-live')).toBe('polite');
		expect(inlineMessage.getAttribute('aria-atomic')).toBe('true');
		expect((inlineMessage as HTMLElement).innerText).toContain('Link copied to clipboard.');
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

		const message = screen.getByText('Publishing failed. Check the form and try again.');
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
