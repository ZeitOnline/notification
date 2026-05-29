import type { NotificationOptions } from '../index';

export const MIN_ANNOUNCEMENT_DELAY = 1500;
export const MAX_ANNOUNCEMENT_DELAY = 4000;
export const ANNOUNCEMENT_DELAY_PER_CHARACTER = 80;

type LiveRegionPoliteness = 'polite' | 'assertive';

const LIVE_REGION_POLITENESS_LEVELS: LiveRegionPoliteness[] = ['polite', 'assertive'];

/**
 * Queues notification messages for screen-reader live regions.
 *
 * Announcement delays are estimated but conservative wait times. They keep messages in the live
 * region long enough to avoid rapid updates overwriting each other before
 * assistive technologies can announce them.
 */
export class LiveRegionAnnouncer {
	private liveRegions = new Map<LiveRegionPoliteness, HTMLDivElement>();
	private announcementQueues = new Map<LiveRegionPoliteness, string[]>();
	private announcementQueueRunning = new Map<LiveRegionPoliteness, boolean>();

	constructor(private root: HTMLElement = document.body) {
		this.createLiveRegions();
	}

	announce(message: string, status: NotificationOptions['status'] = 'info'): void {
		const politeness = this.getPoliteness(status);
		const queue = this.announcementQueues.get(politeness) ?? [];

		queue.push(message);
		this.announcementQueues.set(politeness, queue);

		if (!this.announcementQueueRunning.get(politeness)) {
			this.processAnnouncementQueue(politeness);
		}
	}

	insertBeforeLiveRegions(element: HTMLElement): void {
		this.createLiveRegions();
		const firstLiveRegion = this.root.querySelector('.z-notification-live-region');
		if (firstLiveRegion?.parentElement === this.root) {
			this.root.insertBefore(element, firstLiveRegion);
			return;
		}

		this.root.append(element);
	}

	getAnnouncementDelay(message: string): number {
		return Math.min(
			MAX_ANNOUNCEMENT_DELAY,
			Math.max(MIN_ANNOUNCEMENT_DELAY, message.length * ANNOUNCEMENT_DELAY_PER_CHARACTER),
		);
	}

	private getPoliteness(status: NotificationOptions['status']): LiveRegionPoliteness {
		return status === 'error' ? 'assertive' : 'polite';
	}

	private createLiveRegion(politeness: LiveRegionPoliteness): HTMLDivElement {
		const existingRegion = this.liveRegions.get(politeness);
		let region = existingRegion?.isConnected
			? existingRegion
			: (this.root.querySelector(
					`.z-notification-live-region--${politeness}`,
				) as HTMLDivElement | null);

		if (!region) {
			region = document.createElement('div');
			region.className = `z-notification-live-region z-notification-live-region--${politeness}`;
			region.setAttribute('aria-atomic', 'true');
			region.setAttribute('aria-live', politeness);
			region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
		}

		this.root.append(region);
		this.liveRegions.set(politeness, region);
		return region;
	}

	private createLiveRegions(): void {
		LIVE_REGION_POLITENESS_LEVELS.forEach(politeness => {
			this.createLiveRegion(politeness);
		});
	}

	private processAnnouncementQueue(politeness: LiveRegionPoliteness): void {
		const queue = this.announcementQueues.get(politeness) ?? [];
		const message = queue.shift();

		if (!message) {
			this.announcementQueueRunning.set(politeness, false);
			const region = this.liveRegions.get(politeness);
			if (region) {
				region.textContent = '';
			}
			return;
		}

		this.announcementQueueRunning.set(politeness, true);
		const region = this.createLiveRegion(politeness);
		region.textContent = '';

		setTimeout(() => {
			region.textContent = message;

			setTimeout(() => {
				this.processAnnouncementQueue(politeness);
			}, this.getAnnouncementDelay(message));
		}, 50);
	}
}
