/**
 * @fileOverview
 * @author daniel.kreitschmann@zeit.de
 * @author joseph.mueller@zeit.de
 * @author moritz.stoltenburg@zeit.de
 * @author valentin.vonguttenberg@zeit.de
 * @version 0.3.0
 */

import type {
	NotificationOptions,
	InlineNotificationOptions,
	InlineNotification,
	NotificationElement,
	NotificationService,
} from '../index';

const OFFSET_NOTIFICATION = 16;
const GAP = 8;

const MAX_NOTIFICATIONS_SCREEN = 3;

/**
 * The data-toast-originator` attribute is used to link a notification to its originator element.
 */
const ORIGINATOR_ATTR = 'data-toast-originator';

let originatorCounter = 0;

// Notifications manage ui elements and keep you informed about results, warnings and errors.
// This includes deciding which type of notification to show (e.g., inline or bottom).
export class Notification {
	static instance: Notification | undefined;
	notifications!: NotificationElement[];
	maxNotifications!: number;
	container!: HTMLDivElement | null;
	notificationTimeout!: number;

	constructor() {
		if (Notification.instance) {
			return Notification.instance;
		}
		Notification.instance = this;
		this.notifications = [];
		this.maxNotifications = MAX_NOTIFICATIONS_SCREEN;
		this.container = null;
		this.notificationTimeout = 4000;
	}
	show({
		type,
		position = 'bottom',
		element,
		icon,
		message,
		status,
		button,
		link,
		hasTimer,
	}: NotificationOptions): void {
		if (type) {
			const notificationsToRemove = this.notifications.filter(item => item.type === type);
			notificationsToRemove.forEach(item => this.removeNotification(item));
		}

		const notification = this.createNotification({
			type,
			element,
			icon,
			message,
			status,
			button,
			link,
			hasTimer,
		});

		this.insertNotification(notification, position, element);
		this.notifications.push(notification);
		this.repositionNotifications(position, element);

		if (this.notifications.length > this.maxNotifications) {
			this.removeNotification(this.notifications[0]);
		}

		if (notification.hasTimer) {
			this.startTimeout(notification as NotificationElement);
		}
	}

	/**
	 * When the container is added to the page, a small delay is required
	 * before setting the innerText, otherwise the screen reader might not announce it correctly.
	 */
	async setAndAnnounceMessage(message: string): Promise<void> {
		if (!this.container) {
			console.warn('Inline notification container is not initialized.');
			return;
		}
		this.container.innerText = '';
		await new Promise<void>(resolve => {
			setTimeout(() => {
				resolve();
			}, 50);
		});
		this.container.innerText = message;
	}

	async showInline({ element, message }: InlineNotificationOptions): Promise<void> {
		let inline: InlineNotification = { timeoutID: null };
		this.container = this.createInlineContainer();
		await this.setAndAnnounceMessage(message);
		this.inlinePositioning(element, this.container);

		// using pointerup so that simply touching the screen
		// (e.g. by accident or to start scrolling) does not close the notification instantly
		// this gives the user a better chance to read the message
		const clickOutsideListener = (event: Event): void => {
			if (this.container && !this.container.contains(event.target as Node)) {
				this.removeInlineNotification(this.container as HTMLElement, inline);
				document.removeEventListener('pointerup', clickOutsideListener);
			}
		};
		document.addEventListener('pointerup', clickOutsideListener);

		// remove notification when user scrolls a certain distance
		const lastScrollY = window.scrollY;
		const scrollListener = () => {
			if (Math.abs(window.scrollY - lastScrollY) > 100) {
				this.removeInlineNotification(this.container as HTMLElement, inline);
				document.removeEventListener('scroll', scrollListener);
			}
		};
		document.addEventListener('scroll', scrollListener, {
			passive: true,
		});

		inline.timeoutID = setTimeout(
			() => this.removeInlineNotification(this.container as HTMLElement, inline),
			this.notificationTimeout,
		);
	}

	/**
	 * Creates a container that will be displayed close to the element
	 * that triggered the notification. Do not use a `dialog` element here,
	 * as it is too disruptive for short, timed inline notifications.
	 *
	 * @param {Object} options - Options for the inline container.
	 * @param {string} options.ariaLiveRegionRole - The ARIA role for the live region
	 */
	createInlineContainer(): HTMLDivElement {
		let container = document.querySelector('.z-notification-inline') as HTMLDivElement | null;
		if (!container) {
			container = document.createElement('div');
			container.className = 'z-notification-inline';
			container.setAttribute('role', 'status');
			// aria-live & aria-atomic are redundant to the role, but
			// recommended for better screen reader support
			container.setAttribute('aria-live', 'polite');
			container.setAttribute('aria-atomic', 'true');
			document.body.insertAdjacentElement('beforeend', container);
		}
		return container;
	}

	/**
	 * Creates a div element with NotificationElement properties initialized.
	 * This allows us to attach custom properties (elapsed, isPaused, etc.) to the element.
	 */
	createNotificationElement(): NotificationElement {
		const el = document.createElement('div') as HTMLDivElement & NotificationElement;
		el.type = null;
		el.hasTimer = false;
		el.isPaused = false;
		el.timeoutID = 0;
		el.elapsed = 0;
		el.startedAt = 0;
		el.anchorElement = null;
		return el;
	}

	createNotification({
		type,
		element,
		icon,
		message,
		status = 'info',
		button,
		link,
		hasTimer,
	}: NotificationOptions): NotificationElement {
		const notification = this.createNotificationElement();
		const modStatus = `z-notification__item--${status}`;
		notification.className = `z-notification z-notification__item ${modStatus}`;

		// prettier-ignore
		notification.innerHTML = this.getSvgIcon(icon) +
			(message ? `<span aria-live="polite" class="z-notification__message">${message}</span>` : '') +
			(link ? `<a href="${link.href}" class="z-notification__action-btn">${link.text}</a>` : '') +
			(!link && button ? `<button class="z-notification__action-btn">${button.text}</button>` : '') +
			this.getCloseButtonHTML(!!hasTimer);

		if (element) {
			notification.setAttribute(ORIGINATOR_ATTR, this.getOrCreateOriginatorId(element));
		}

		if (button && button.onClick) {
			const actionElement = notification.querySelector(
				'.z-notification__action-btn',
			) as HTMLElement;
			actionElement.onclick = () => {
				button.onClick();
				this.removeNotification(notification, true);
			};
		}

		const closeButton = notification.querySelector('.z-notification__close-btn') as HTMLElement;
		if (closeButton) {
			closeButton.style.setProperty(
				'--z-notification-duration',
				`${this.notificationTimeout}ms`,
			);
			closeButton.onclick = () => this.removeNotification(notification, true);
		}

		if (type) {
			notification.type = type;
		}

		if (!!hasTimer) {
			notification.hasTimer = true;
			this.addPauseResumeEvents(notification);
		}

		return notification;
	}

	insertNotification(
		notification: NotificationElement,
		position: string,
		originator?: HTMLElement,
	): void {
		notification.classList.add(
			position === 'top' ? 'z-notification--top' : 'z-notification--bottom',
		);
		notification.anchorElement = originator ?? null;

		if (originator?.parentElement) {
			const insertionPoint = this.findNotificationInsertionPoint(originator);
			insertionPoint.insertAdjacentElement('afterend', notification);
		} else {
			document.body.insertAdjacentElement('beforeend', notification);
		}
	}

	findNotificationInsertionPoint(originator: HTMLElement): HTMLElement {
		let insertionPoint = originator;
		while (
			insertionPoint.nextElementSibling &&
			this.isNotificationElement(insertionPoint.nextElementSibling)
		) {
			insertionPoint = insertionPoint.nextElementSibling as HTMLElement;
		}
		return insertionPoint;
	}

	getNotificationAnchor(notification: HTMLElement): HTMLElement | null {
		let anchor: Element | null = notification.previousElementSibling;

		while (anchor && this.isNotificationElement(anchor)) {
			anchor = anchor.previousElementSibling;
		}

		return anchor instanceof HTMLElement ? anchor : null;
	}

	isNotificationElement(element: Element): element is NotificationElement {
		return element.classList.contains('z-notification');
	}

	repositionNotifications(position: string, element?: HTMLElement): void {
		let offset = GAP;
		this.notifications.forEach((notification, index) => {
			this.positionNotification(notification, position, offset + OFFSET_NOTIFICATION, index);
			offset += notification.getBoundingClientRect().height + GAP;
		});
	}

	positionNotification(
		notification: NotificationElement,
		position: string,
		offset: number,
		index: number,
	): void {
		notification.style.position = 'fixed';
		notification.style.zIndex = `${1000 + index}`;

		if (position === 'top') {
			notification.style.top = `calc(${offset}px + env(safe-area-inset-top, 0px))`;
			notification.style.bottom = 'auto';
		} else {
			notification.style.bottom = `calc(${offset}px + env(safe-area-inset-bottom, 0px))`;
			notification.style.top = 'auto';
		}
	}

	getCloseButtonHTML(hasTimer: boolean): string {
		const modTimer = hasTimer ? 'z-notification__close-btn--timer' : '';
		const TIMER_HTML = `<svg class="z-notification__close-ring" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="11.5"/>
		</svg>`;
		return (
			`<button class="z-notification__close-btn${modTimer}" aria-label="Meldung schließen">` +
			(hasTimer ? TIMER_HTML : '') +
			`<svg class="z-notification__close-cross" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<path d="M15 15L3 3" stroke="currentColor" stroke-width="1.5"/>
				<path d="M15 3L3 15" stroke="currentColor" stroke-width="1.5"/>
			</svg>
		</button>`
		);
	}

	getSvgIcon(icon: string | undefined): string {
		if (!icon) return '';
		if (document.querySelector(`#svg-${icon}`) as SVGUseElement | null) {
			return `<svg class="svg-symbol z-notification__icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<use xlink:href="#svg-${icon}" />
			</svg>`;
		}
		return '';
	}

	inlinePositioning(element: HTMLElement, container: HTMLElement): void {
		let margin = 8;
		let rect = element.getBoundingClientRect();
		const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
		const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

		container.style.top = 'auto';
		container.style.right = 'auto';
		container.style.left = Math.round(window.scrollX + rect.left) + 'px';
		container.style.bottom =
			Math.round(0 - window.scrollY + viewportHeight - rect.top + margin) + 'px';

		rect = container.getBoundingClientRect();

		if (rect.right >= viewportWidth) {
			container.style.left = 'auto';
			container.style.right = 'var(--z-gap)';
		}
	}

	startTimeout(notification: NotificationElement, duration = this.notificationTimeout): void {
		notification.startedAt = Date.now();
		notification.timeoutID = setTimeout(() => {
			if (!notification.isPaused) {
				this.removeNotification(notification);
			}
		}, duration);
	}

	addPauseResumeEvents(notification: NotificationElement): void {
		const ring = notification.querySelector(
			'.z-notification__close-ring circle',
		) as SVGCircleElement | null;

		const pause = () => {
			notification.isPaused = true;
			notification.elapsed += Date.now() - notification.startedAt;
			clearTimeout(notification.timeoutID);
			if (ring) {
				ring.style.animationPlayState = 'paused';
			}
		};

		const resume = () => {
			notification.isPaused = false;
			notification.startedAt = Date.now();
			const remaining = this.notificationTimeout - notification.elapsed;
			if (remaining <= 0) {
				this.removeNotification(notification);
				return;
			}
			this.startTimeout(notification, remaining);
			if (ring) {
				ring.style.animationPlayState = 'running';
			}
		};

		notification.addEventListener('pointerenter', pause);
		notification.addEventListener('pointerleave', resume);
	}

	removeNotification(notification: HTMLElement | null, returnFocus = false): void {
		if (!notification) return;

		const notif = notification as NotificationElement;
		const position = notif.classList.contains('z-notification--top') ? 'top' : 'bottom';
		const anchor = notif.anchorElement;

		notif.remove();
		this.notifications = this.notifications.filter(t => t !== notification);

		clearTimeout(notif.timeoutID);
		this.repositionNotifications(position, anchor ?? undefined);
		if (returnFocus) {
			this.focusOriginator(notif);
		}
	}

	linkOriginator(notification: NotificationElement, originator: HTMLElement): void {
		const originatorId = this.getOrCreateOriginatorId(originator);
		notification.setAttribute(ORIGINATOR_ATTR, originatorId);
	}

	findOriginator(notification: NotificationElement): HTMLElement | null {
		const originatorId = notification.getAttribute(ORIGINATOR_ATTR);
		if (!originatorId) {
			return notification.anchorElement;
		}

		const selector = `[${ORIGINATOR_ATTR}="${originatorId}"]`;
		const originator = document.querySelector(selector);

		if (originator instanceof HTMLElement) {
			return originator;
		}

		return notification.anchorElement;
	}

	focusOriginator(notification: NotificationElement): void {
		const originator = this.findOriginator(notification);
		if (!originator || !originator.isConnected) return;

		originator.focus();
	}

	getOrCreateOriginatorId(originator: HTMLElement): string {
		const existingId = originator.getAttribute(ORIGINATOR_ATTR);
		if (existingId) {
			return existingId;
		}

		const id = `${++originatorCounter}`;
		originator.setAttribute(ORIGINATOR_ATTR, id);
		return id;
	}

	removeInlineNotification(container: HTMLElement, inline: InlineNotification): void {
		if (inline.timeoutID) {
			clearTimeout(inline.timeoutID);
		}
		container.remove();
	}

	debug(): void {
		console.log('Notification service from npm.');
	}
}

const notification: NotificationService = {
	notification: new Notification(),
	showInline({ message, element }: InlineNotificationOptions): Promise<void> {
		return this.notification.showInline({ message, element });
	},
	show({
		type,
		position,
		element,
		icon,
		message,
		status,
		button,
		link,
		hasTimer,
	}: NotificationOptions): void {
		this.notification.show({
			type,
			position,
			element,
			icon,
			message,
			status,
			button,
			link,
			hasTimer,
		});
	},
	debug(): void {
		this.notification.debug();
	},
};

// for debugging purposes in zeit.web
if (window.Zeit) {
	window.Zeit.notification = notification;
}

export default notification;
