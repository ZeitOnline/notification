/**
 * @fileOverview
 * @author daniel.kreitschmann@zeit.de
 * @author joseph.mueller@zeit.de
 * @author moritz.stoltenburg@zeit.de
 * @author valentin.vonguttenberg@zeit.de
 * @description This file contains the implementation of the Notification class, which manages the display and behavior of notifications in the application. It provides methods to show both inline and positioned notifications. It also handles their lifecycle (e.g., auto-dismissal, pause on hover). The class also ensures that only a certain number of notifications are displayed per position and that they are properly stacked and announced for accessibility.
 * @version 0.3.0
 */

import type {
	NotificationOptions,
	InlineNotificationOptions,
	InlineNotification,
	NotificationElement,
	NotificationService,
	NotificationPosition,
} from '../index';

const GAP_STACKING = 8;
export const MAX_NOTIFICATIONS_PER_POSITION = 3;
const OFFSET =
	getComputedStyle(document.documentElement).getPropertyValue('--z-offset-notification').trim() ||
	'1.5rem';
const ZINDEX_BASE =
	parseInt(
		getComputedStyle(document.documentElement)
			.getPropertyValue('--z-index-notification')
			.trim(),
	) || 1000;

export class Notification {
	static instance: Notification | undefined;
	originatorCounter = 0;
	notifications!: NotificationElement[];
	notificationStacks!: Map<NotificationPosition, NotificationElement[]>;
	container!: HTMLDivElement | null;
	notificationTimeout!: number;

	constructor() {
		if (Notification.instance) {
			return Notification.instance;
		}
		Notification.instance = this;
		this.notifications = [];
		this.notificationStacks = new Map();
		this.container = null;
		this.notificationTimeout = 4000;
	}
	show({
		type,
		position = 'top-right',
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
			element,
			position,
			type,
			icon,
			message,
			status,
			button,
			link,
			hasTimer,
		});

		this.insertNotification(notification);
		this.notifications.push(notification);

		this.addNotificationToStack(notification, position);
		this.positionNotifications(position);

		if (notification.hasTimer) {
			this.startTimeout(notification);
		}
	}

	/**
	 * When the container is added to the page, a small delay is required
	 * before setting the innerText, otherwise the screen reader might not announce it correctly.
	 */
	async setAndAnnounceMessage(message: string): Promise<void> {
		if (!this.container) {
			console.warn('Notification container is not initialized.');
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
	createNotificationElement(element: HTMLElement): NotificationElement {
		const el = document.createElement('div') as NotificationElement;
		el.type = null;
		el.hasTimer = false;
		el.isPaused = false;
		el.timeoutID = null;
		el.elapsed = 0;
		el.startedAt = 0;
		el.anchorElement = element;
		return el;
	}

	createNotification({
		element = document.body,
		position,
		type,
		icon,
		message,
		status = 'info',
		button,
		link,
		hasTimer,
	}: NotificationOptions): NotificationElement {
		const notification = this.createNotificationElement(element);
		notification.className = `z-notification z-notification--${position} z-notification--${status}`;
		notification.dataset.position = position;

		const buttonClass = 'z-notification__action-btn';

		// prettier-ignore
		notification.innerHTML = this.getSvgIcon(icon) +
			(message ? `<span aria-live="polite" class="z-notification__message">${message}</span>` : '') +
			(link ? `<a href="${link.href}" class="${buttonClass}">${link.text}</a>` : '') +
			(!link && button ? `<button class="${buttonClass}">${button.text}</button>` : '') +
			this.getCloseButtonHTML(!!hasTimer);

		if (button && button.onClick) {
			const actionElement = notification.querySelector(
				`.${buttonClass}`,
			) as HTMLButtonElement;
			actionElement.onclick = () => {
				button.onClick();
				this.removeNotification(notification);
			};
		}

		const closeButton = notification.querySelector(
			'.z-notification__close-btn',
		) as HTMLButtonElement;
		if (closeButton) {
			closeButton.style.setProperty(
				'--z-notification-duration',
				`${this.notificationTimeout}ms`,
			);
			closeButton.onclick = () => this.removeNotification(notification);
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

	getOrCreateStack(position: NotificationPosition): NotificationElement[] {
		const stack = this.notificationStacks.get(position);
		if (stack) return stack;

		const nextStack: NotificationElement[] = [];
		this.notificationStacks.set(position, nextStack);
		return nextStack;
	}

	addNotificationToStack(
		notification: NotificationElement,
		position: NotificationPosition,
	): void {
		const stack = this.getOrCreateStack(position);
		stack.push(notification);

		if (stack.length > MAX_NOTIFICATIONS_PER_POSITION) {
			this.removeNotification(stack[0], {
				reposition: false,
				restoreFocus: false,
			});
		}
	}

	/**
	 * @param notification The notification element to be inserted into the DOM.
	 * @returns void
	 * @description Inserts the notification element into the DOM at the correct position based on its anchor element. When the anchor is the body, a focused direct child can still act as the insertion point so body-level notifications stay next to the trigger instead of moving to the end of the document.
	 */
	insertNotification(notification: NotificationElement): void {
		let insertionPoint = notification.anchorElement;

		if (insertionPoint === document.body) {
			const activeElement = document.activeElement;
			if (
				activeElement instanceof HTMLElement &&
				activeElement !== document.body &&
				activeElement.parentElement === document.body
			) {
				insertionPoint = activeElement;
			} else {
				document.body.insertAdjacentElement('beforeend', notification);
				return;
			}
		}

		while (insertionPoint.nextElementSibling?.classList.contains('z-notification')) {
			insertionPoint = insertionPoint.nextElementSibling as HTMLElement;
		}

		insertionPoint.insertAdjacentElement('afterend', notification);
	}

	positionNotifications(position: NotificationPosition): void {
		const stack = this.getOrCreateStack(position);
		let stackingOffset = 0;
		stack.forEach((notification, index) => {
			if (position === 'bottom') {
				notification.style.bottom = `calc(${OFFSET} + ${stackingOffset}px + env(safe-area-inset-bottom, 0px))`;
				notification.style.top = 'auto';
				notification.style.left = '0';
				notification.style.right = '0';
				notification.style.marginInline = 'auto';
			} else if (position === 'top-right') {
				notification.style.bottom = 'auto';
				notification.style.top = `calc(${OFFSET} + ${stackingOffset}px + env(safe-area-inset-top, 0px))`;
				notification.style.left = 'auto';
				notification.style.right = `calc(${OFFSET} + env(safe-area-inset-right, 0px))`;
				notification.style.marginInline = '0';
			} else {
				notification.style.bottom = 'auto';
				notification.style.top = `calc(${OFFSET} + ${stackingOffset}px + env(safe-area-inset-top, 0px))`;
				notification.style.left = '0';
				notification.style.right = '0';
				notification.style.marginInline = 'auto';
			}
			notification.style.zIndex = `${ZINDEX_BASE + index}`;
			stackingOffset += notification.getBoundingClientRect().height + GAP_STACKING;
		});
	}

	getCloseButtonHTML(hasTimer: boolean): string {
		const modTimer = hasTimer ? ' z-notification__close-btn--timer' : '';
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
			if (notification.timeoutID) {
				clearTimeout(notification.timeoutID);
			}
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

	removeNotification(
		notification: NotificationElement | null,
		options: {
			reposition?: boolean;
			restoreFocus?: boolean;
		} = {},
	): void {
		if (!notification) return;
		const { reposition = true, restoreFocus = true } = options;

		const position = this.getNotificationPosition(notification);

		const anchor = notification.anchorElement;

		if (notification.timeoutID) {
			clearTimeout(notification.timeoutID);
		}

		this.dispatchEvent('notification-removed', anchor);
		notification.remove();

		this.notifications = this.notifications.filter(t => t !== notification);
		const stack = this.notificationStacks.get(position);

		this.removeNotificationFromStack(position, notification);

		if (stack && stack.length > 0 && reposition) {
			this.positionNotifications(position);
		}
		if (restoreFocus) {
			anchor.focus();
		}
	}

	removeNotificationFromStack(
		position: NotificationPosition,
		notification: NotificationElement,
	): void {
		const stack = this.notificationStacks.get(position);
		if (!stack) return;

		const stackIndex = stack.indexOf(notification);
		// Remove only the matching notification from its position stack.
		if (stackIndex !== -1) {
			stack.splice(stackIndex, 1);
		}

		// Drop empty stacks so the map only stores active positions.
		if (stack.length === 0) {
			this.notificationStacks.delete(position);
		}
	}

	getNotificationPosition(notification: NotificationElement): NotificationPosition {
		const datasetPosition = notification.dataset.position as NotificationPosition | undefined;
		if (datasetPosition) return datasetPosition;

		switch (true) {
			case notification.classList.contains('z-notification--top-right'):
				return 'top-right';
			case notification.classList.contains('z-notification--top'):
				return 'top';
			default:
				return 'bottom';
		}
	}

	dispatchEvent(eventName: string, anchor: HTMLElement | null): void {
		document.dispatchEvent(
			new CustomEvent(eventName, {
				detail: { originator: anchor },
			}),
		);
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
