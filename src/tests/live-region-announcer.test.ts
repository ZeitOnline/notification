import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ANNOUNCEMENT_DELAY_PER_CHARACTER,
	LiveRegionAnnouncer,
	MAX_ANNOUNCEMENT_DELAY,
	MIN_ANNOUNCEMENT_DELAY,
} from '../live-region-announcer';

const getLiveRegion = (politeness: 'polite' | 'assertive'): HTMLElement => {
	const liveRegion = document.querySelector(
		`.z-notification-live-region--${politeness}`,
	) as HTMLElement | null;
	if (!liveRegion) {
		throw new Error(`Expected ${politeness} notification live region`);
	}
	return liveRegion;
};

describe('live region announcer', () => {
	let announcer: LiveRegionAnnouncer;

	beforeEach(() => {
		document.body.innerHTML = '';
		vi.useFakeTimers();
		announcer = new LiveRegionAnnouncer();
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		document.body.innerHTML = '';
	});

	it('creates polite and assertive live regions', () => {
		const politeRegion = getLiveRegion('polite');
		const assertiveRegion = getLiveRegion('assertive');

		expect(politeRegion.getAttribute('role')).toBe('status');
		expect(politeRegion.getAttribute('aria-live')).toBe('polite');
		expect(politeRegion.getAttribute('aria-atomic')).toBe('true');
		expect(assertiveRegion.getAttribute('role')).toBe('alert');
		expect(assertiveRegion.getAttribute('aria-live')).toBe('assertive');
		expect(assertiveRegion.getAttribute('aria-atomic')).toBe('true');
	});

	it('announces info, success and warning messages politely', async () => {
		announcer.announce('Informational update', 'info');
		announcer.announce('Saved successfully', 'success');
		announcer.announce('Storage almost full', 'warning');

		const politeRegion = getLiveRegion('polite');
		const assertiveRegion = getLiveRegion('assertive');

		await vi.advanceTimersByTimeAsync(50);
		expect(politeRegion.textContent).toBe('Informational update');
		expect(assertiveRegion.textContent).toBe('');

		await vi.advanceTimersByTimeAsync(
			announcer.getAnnouncementDelay('Informational update') + 50,
		);
		expect(politeRegion.textContent).toBe('Saved successfully');

		await vi.advanceTimersByTimeAsync(
			announcer.getAnnouncementDelay('Saved successfully') + 50,
		);
		expect(politeRegion.textContent).toBe('Storage almost full');
	});

	it('announces error messages assertively', async () => {
		announcer.announce('Publishing failed', 'error');

		await vi.advanceTimersByTimeAsync(50);

		expect(getLiveRegion('polite').textContent).toBe('');
		expect(getLiveRegion('assertive').textContent).toBe('Publishing failed');
	});

	it('announces polite notifications one after another instead of overwriting the live region', async () => {
		announcer.announce('First notification', 'info');
		announcer.announce('Second notification', 'success');

		const liveRegion = getLiveRegion('polite');

		expect(liveRegion.textContent).toBe('');

		await vi.advanceTimersByTimeAsync(50);
		expect(liveRegion.textContent).toBe('First notification');

		await vi.advanceTimersByTimeAsync(MIN_ANNOUNCEMENT_DELAY);
		expect(liveRegion.textContent).toBe('');

		await vi.advanceTimersByTimeAsync(50);
		expect(liveRegion.textContent).toBe('Second notification');
	});

	it('keeps assertive and polite announcement queues separate', async () => {
		announcer.announce('Informational update', 'info');
		announcer.announce('Publishing failed', 'error');

		await vi.advanceTimersByTimeAsync(50);

		expect(getLiveRegion('polite').textContent).toBe('Informational update');
		expect(getLiveRegion('assertive').textContent).toBe('Publishing failed');
	});

	it('inserts elements before live regions so announcers stay at the end of the root', () => {
		const element = document.createElement('div');
		element.className = 'z-notification';

		announcer.insertBeforeLiveRegions(element);

		expect(document.body.firstElementChild).toBe(element);
		expect(document.body.lastElementChild).toBe(getLiveRegion('assertive'));
	});

	it('reuses existing live regions', () => {
		const existingPoliteRegion = getLiveRegion('polite');
		const existingAssertiveRegion = getLiveRegion('assertive');

		new LiveRegionAnnouncer();

		expect(document.querySelectorAll('.z-notification-live-region')).toHaveLength(2);
		expect(getLiveRegion('polite')).toBe(existingPoliteRegion);
		expect(getLiveRegion('assertive')).toBe(existingAssertiveRegion);
	});

	it('clamps announcement delays between the configured minimum and maximum', () => {
		expect(announcer.getAnnouncementDelay('Short')).toBe(MIN_ANNOUNCEMENT_DELAY);
		expect(announcer.getAnnouncementDelay('x'.repeat(30))).toBe(
			30 * ANNOUNCEMENT_DELAY_PER_CHARACTER,
		);
		expect(announcer.getAnnouncementDelay('x'.repeat(100))).toBe(MAX_ANNOUNCEMENT_DELAY);
	});
});
