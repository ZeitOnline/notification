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
	NotificationEventDetail,
	NotificationRemovalReason,
	NotificationService,
	NotificationPosition,
	SettingsOptions,
} from '../index';
import { LiveRegionAnnouncer } from './live-region-announcer';

export const MAX_NOTIFICATIONS_PER_POSITION = 3;
export const OFFSET = 24;
export const GAP_STACKING = 8;
export const NOTIFICATION_REMOVED_EVENT = 'notification-removed';
export const NOTIFICATION_SHOWN_EVENT = 'notification-shown';
export const NOTIFICATION_ACTION_EVENT = 'notification-action';
const HINT_DISMISSED_KEY = 'z.notification.hint';
const STORED_DURATION_KEY = 'z.notification.duration';
const HINT_DISMISS_MAX_AGE = 2 * 24 * 60 * 60; // 2 days
const DEFAULT_SETTINGS_HINT_COPY = {
	message: 'Automatisch ausblenden?',
	buttonText: 'Konfigurieren',
	openingMessage: 'Neuer Tab wird geöffnet …',
};

export class Notification {
	static instance: Notification | undefined;
	originatorCounter = 0;
	notificationStacks!: Map<NotificationPosition, NotificationElement[]>;
	container!: HTMLDivElement | null;
	announcer!: LiveRegionAnnouncer;
	notificationTimeout?: number;

	constructor() {
		if (Notification.instance) {
			return Notification.instance;
		}
		Notification.instance = this;
		this.notificationStacks = new Map();
		this.container = null;
		this.announcer = new LiveRegionAnnouncer();
	}
	show({
		group,
		position = 'top-right',
		element,
		icon,
		message,
		status,
		button,
		link,
		hasTimer,
		onClose,
		settings,
		data,
	}: NotificationOptions): NotificationElement {
		if (group) {
			const notificationsToRemove = this.notificationStacks
				.get(position)
				?.filter(item => item.group === group);
			notificationsToRemove?.forEach(notification => {
				this.removeNotification(notification, { shouldReflow: false, reason: 'replaced' });
			});
		}

		const storedDuration = hasTimer ? this.getStoredDuration() : null;
		const duration = hasTimer ? (storedDuration ?? this.notificationTimeout) : undefined;
		const hasActiveTimer = hasTimer && duration !== undefined;

		const notification = this.createNotification(
			{
				element,
				position,
				group,
				icon,
				message,
				status,
				button,
				link,
				hasTimer: hasActiveTimer,
				onClose,
				data,
			},
			duration,
		);

		this.insertNotification(notification);
		this.announcer.announce(message, status);

		this.addNotificationToStack(notification);
		this.positionNotifications(position);
		this.dispatchNotificationShown(notification);

		if (hasTimer) {
			if (storedDuration === null && settings?.url && !this.isDurationHintDismissed()) {
				notification.companionNotification = this.showDurationHint(
					notification.anchorElement,
					settings,
					notification.position,
				);
			}
			if (notification.hasTimer) {
				this.startTimeout(notification, notification.remaining);
			}
		}

		return notification;
	}

	setInlineMessage(message: string): void {
		if (!this.container) {
			console.warn('Notification container is not initialized.');
			return;
		}
		this.container.innerText = message;
	}

	async showInline({ element, message }: InlineNotificationOptions): Promise<void> {
		let inline: InlineNotification = { timeoutID: null };
		this.container = this.createInlineContainer();
		this.setInlineMessage(message);
		this.announcer.announce(message);
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

		if (this.notificationTimeout !== undefined) {
			inline.timeoutID = setTimeout(
				() => this.removeInlineNotification(this.container as HTMLElement, inline),
				this.notificationTimeout,
			);
		}
	}

	/**
	 * Creates a container that will be displayed close to the element
	 * that triggered the notification. Do not use a `dialog` element here,
	 * as it is too disruptive for short, timed inline notifications.
	 */
	createInlineContainer(): HTMLDivElement {
		let container = document.querySelector('.z-notification-inline') as HTMLDivElement | null;
		if (!container) {
			container = document.createElement('div');
			container.className = 'z-notification-inline';
			this.announcer.insertBeforeLiveRegions(container);
		}
		return container;
	}

	/**
	 * Creates a div element with NotificationElement properties initialized.
	 * This allows us to attach custom properties (elapsed, isPaused, etc.) to the element.
	 */
	createNotificationElement(
		element: HTMLElement,
		group: string | null,
		position: NotificationPosition,
		onClose?: (() => void) | null,
	): NotificationElement {
		const el = document.createElement('div') as unknown as NotificationElement;
		el.setAttribute('popover', 'manual');
		el.group = group;
		el.hasTimer = false;
		el.onClose = onClose;
		el.isPaused = false;
		el.position = position;
		el.timeoutID = null;
		el.elapsed = 0;
		el.startedAt = 0;
		el.anchorElement = element;
		el.isCompanion = false;
		return el;
	}

	createNotification(
		{
			element = document.body,
			group = null,
			position = 'top-right',
			icon,
			message,
			status = 'info',
			button,
			link,
			hasTimer,
			onClose = null,
			data,
		}: NotificationOptions,
		duration = this.notificationTimeout,
	): NotificationElement {
		const notification = this.createNotificationElement(element, group, position, onClose);
		notification.remaining = duration;
		notification.status = status;
		// the configured duration, unlike `remaining`, which pause/resume mutates
		notification.duration = duration;
		notification.data = data;
		notification.className = `z-notification z-notification--${position} z-notification--${status}`;

		const buttonClass = 'z-notification__action-btn';

		// prettier-ignore
		notification.innerHTML = this.getSvgIcon(icon) +
			(message ? `<span class="z-notification__message" data-notification-part="message">${this.escapeHtml(message)}</span>` : '') +
			(link ? `<a href="${this.sanitizeUrl(link.href)}" class="${buttonClass}" data-notification-part="action">${this.escapeHtml(link.text)}</a>` : '') +
			(!link && button ? `<button class="${buttonClass}" data-notification-part="action">${this.escapeHtml(button.text)}</button>` : '') +
			this.getCloseButtonHTML(!!hasTimer);

		const actionElement = notification.querySelector<HTMLElement>(`.${buttonClass}`);
		if (actionElement) {
			notification.actionType = actionElement.tagName === 'A' ? 'link' : 'button';
			// assigned as a property rather than a listener, so callers such as
			// showDurationHint() can replace the default behavior entirely
			actionElement.onclick = () => {
				this.dispatchNotificationAction(notification);
				if (button?.onClick) {
					button.onClick();
					this.setFocus(notification.anchorElement);
					this.removeNotification(notification, { reason: 'action' });
				}
			};
		}

		const closeButton = notification.querySelector(
			'.z-notification__close-btn',
		) as HTMLButtonElement;
		if (closeButton) {
			if (duration !== undefined) {
				closeButton.style.setProperty('--z-notification-duration', `${duration}ms`);
			}
			closeButton.onclick = () => {
				this.setFocus(notification.anchorElement);
				notification.remaining = 0;
				this.removeNotification(notification, { reason: 'close' });
			};
		}

		if (!!hasTimer) {
			notification.hasTimer = true;
			this.addPauseResumeEvents(notification);
		}

		return notification;
	}

	getStack(position: NotificationPosition): NotificationElement[] {
		const stack = this.notificationStacks.get(position);
		if (stack) return stack;

		const nextStack: NotificationElement[] = [];
		this.notificationStacks.set(position, nextStack);
		return nextStack;
	}

	addNotificationToStack(notification: NotificationElement): void {
		const stack = this.getStack(notification.position);
		stack.push(notification);
		if (stack.length > MAX_NOTIFICATIONS_PER_POSITION) {
			this.removeNotification(stack[0], { shouldReflow: false, reason: 'evicted' });
		}
	}

	/**
	 * @param notification The notification element to be inserted into the DOM.
	 * @returns void
	 * @description Inserts the notification element into the DOM at the correct position
	 * based on its anchor element. When the anchor is the body, a focused direct child
	 * can still act as the insertion point so body-level notifications stay next
	 * to the trigger instead of moving to the end of the document.
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
				this.announcer.insertBeforeLiveRegions(notification);
				notification.showPopover();
				return;
			}
		}

		while (insertionPoint.nextElementSibling?.classList.contains('z-notification')) {
			insertionPoint = insertionPoint.nextElementSibling as HTMLElement;
		}

		insertionPoint.insertAdjacentElement('afterend', notification);
		notification.showPopover();
	}

	positionNotifications(position: NotificationPosition): void {
		const stack = this.getStack(position);
		let stackingOffset = 0;
		const visualStack = [...stack].reverse();

		visualStack.forEach(notification => {
			if (position === 'bottom') {
				notification.style.bottom = `calc(${OFFSET}px + ${stackingOffset}px + env(safe-area-inset-bottom, 0px))`;
				notification.style.top = 'auto';
				notification.style.left = '0';
				notification.style.right = '0';
				notification.style.marginInline = 'auto';
			} else if (position === 'top') {
				notification.style.top = `calc(${OFFSET}px + ${stackingOffset}px + env(safe-area-inset-top, 0px))`;
				notification.style.bottom = 'auto';
				notification.style.left = '0';
				notification.style.right = '0';
				notification.style.marginInline = 'auto';
			} else {
				// default position is 'top-right'
				notification.style.top = `calc(${OFFSET}px + ${stackingOffset}px + env(safe-area-inset-top, 0px))`;
				notification.style.bottom = 'auto';
				notification.style.left = 'auto';
				notification.style.right = `calc(${OFFSET}px + env(safe-area-inset-right, 0px))`;
				notification.style.marginInline = '0';
			}
			stackingOffset += notification.getBoundingClientRect().height + GAP_STACKING;
		});
	}

	getCloseButtonHTML(hasTimer: boolean): string {
		const modTimer = hasTimer ? ' z-notification__close-btn--timer' : '';
		const TIMER_HTML = `<svg class="z-notification__close-ring" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="11.5"/>
		</svg>`;
		return (
			`<button class="z-notification__close-btn${modTimer}" data-notification-part="close" aria-label="Meldung schließen">` +
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
			return `<svg class="svg-symbol z-notification__icon" data-notification-part="icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<use xlink:href="#svg-${icon}" />
			</svg>`;
		}
		return '';
	}

	escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	sanitizeUrl(href: string): string {
		try {
			const url = new URL(href, window.location.href);
			if (url.protocol === 'http:' || url.protocol === 'https:') {
				return href;
			}
		} catch {
			// Invalid URL
		}
		console.warn('[Notification] Invalid or unsafe URL blocked:', href);
		return '#';
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

	isDurationHintDismissed(): boolean {
		return document.cookie.includes(`${HINT_DISMISSED_KEY}=`);
	}

	dismissDurationHint(): void {
		document.cookie = `${HINT_DISMISSED_KEY}=1; max-age=${HINT_DISMISS_MAX_AGE}; path=/; SameSite=Strict`;
	}

	getStoredDuration(): number | null {
		try {
			const parsed = Number(localStorage.getItem(STORED_DURATION_KEY));
			return !isNaN(parsed) && parsed > 0 ? parsed : null;
		} catch {
			return null;
		}
	}

	showDurationHint(
		anchorElement: HTMLElement,
		settings: SettingsOptions,
		position: NotificationPosition,
	): NotificationElement {
		const {
			message = DEFAULT_SETTINGS_HINT_COPY.message,
			buttonText = DEFAULT_SETTINGS_HINT_COPY.buttonText,
			openingMessage = DEFAULT_SETTINGS_HINT_COPY.openingMessage,
		} = settings;

		const notification = this.createNotification({
			element: anchorElement,
			position,
			message,
			button: { text: buttonText, onClick: () => {} },
			onClose: () => this.dismissDurationHint(),
		});
		notification.isCompanion = true;

		const actionButton = notification.querySelector(
			'.z-notification__action-btn',
		) as HTMLButtonElement | null;
		if (actionButton) {
			actionButton.onclick = () => {
				this.dispatchNotificationAction(notification);
				const messageEl = notification.querySelector('.z-notification__message');
				if (messageEl) {
					messageEl.textContent = openingMessage;
				}
				notification
					.querySelector<HTMLButtonElement>('.z-notification__close-btn')
					?.focus();
				actionButton.remove();
				setTimeout(() => {
					window.open(settings.url, '_blank', 'noopener,noreferrer');
					this.removeNotification(notification);
				}, 2000);
			};
		}

		this.insertNotification(notification);
		const stack = this.getStack(notification.position);
		if (notification.position === 'bottom') {
			stack.push(notification);
		} else {
			stack.splice(stack.length - 1, 0, notification);
		}
		// Companion is general UI scaffolding, not a user-event notification,
		// so it gets a dedicated extra slot instead of evicting an older notification.
		if (stack.length > MAX_NOTIFICATIONS_PER_POSITION + 1) {
			this.removeNotification(stack[0], { shouldReflow: false, reason: 'evicted' });
		}
		this.positionNotifications(notification.position);
		this.dispatchNotificationShown(notification);
		return notification;
	}

	startTimeout(notification: NotificationElement, duration = this.notificationTimeout): void {
		if (duration === undefined) return;
		notification.startedAt = Date.now();
		notification.timeoutID = setTimeout(() => {
			if (!notification.isPaused) {
				this.expireTimedNotification(notification);
			}
		}, duration);
	}

	expireTimedNotification(notification: NotificationElement): void {
		const activeElement = document.activeElement;
		if (activeElement && notification.contains(activeElement)) {
			this.setFocus(notification.anchorElement);
		}
		notification.remaining = 0;
		this.removeNotification(notification, { reason: 'timeout' });
	}

	addPauseResumeEvents(notification: NotificationElement): void {
		const initialDuration = notification.remaining;
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
			if (initialDuration === undefined) return;
			notification.remaining = initialDuration - notification.elapsed;
			if (notification.remaining <= 0) {
				this.expireTimedNotification(notification);
				return;
			}
			this.startTimeout(notification, notification.remaining);
			if (ring) {
				ring.style.animationPlayState = 'running';
			}
		};

		notification.addEventListener('pointerenter', pause);
		notification.addEventListener('pointerleave', resume);
	}

	removeNotification(
		notification: NotificationElement | null,
		{
			shouldReflow = true,
			reason = 'programmatic',
		}: { shouldReflow?: boolean; reason?: NotificationRemovalReason } = {},
	): void {
		if (!notification) return;

		if (notification.timeoutID) {
			clearTimeout(notification.timeoutID);
		}
		// when a grouped notification is removed, it can have some time remaining
		// this happens, when the next notification of the same group appears.
		// onClose won't get called then.
		if (
			notification.remaining !== undefined &&
			notification.remaining <= 0 &&
			notification.onClose
		) {
			notification.onClose();
		}
		this.finishRemovingNotification(notification, { shouldReflow, reason });
	}

	/**
	 * Describes a notification for consumers listening to its lifecycle events.
	 * Everything here is derived from the notification itself, so consumers do
	 * not need to know how the notification was created or where it lives.
	 */
	getEventDetail(notification: NotificationElement): NotificationEventDetail {
		return {
			originator: notification.anchorElement,
			notification,
			group: notification.group,
			status: notification.status,
			hasTimer: notification.hasTimer,
			duration: notification.duration,
			actionType: notification.actionType,
			isCompanion: notification.isCompanion,
			data: notification.data,
		};
	}

	dispatchNotificationShown(notification: NotificationElement): void {
		window.dispatchEvent(
			new CustomEvent(NOTIFICATION_SHOWN_EVENT, {
				detail: this.getEventDetail(notification),
			}),
		);
	}

	dispatchNotificationAction(notification: NotificationElement): void {
		window.dispatchEvent(
			new CustomEvent(NOTIFICATION_ACTION_EVENT, {
				detail: this.getEventDetail(notification),
			}),
		);
	}

	dispatchNotificationRemoved(
		notification: NotificationElement,
		reason: NotificationRemovalReason = 'programmatic',
	): void {
		window.dispatchEvent(
			new CustomEvent(NOTIFICATION_REMOVED_EVENT, {
				detail: { ...this.getEventDetail(notification), reason },
			}),
		);
	}

	finishRemovingNotification(
		notification: NotificationElement,
		{
			shouldReflow = true,
			reason = 'programmatic',
		}: { shouldReflow?: boolean; reason?: NotificationRemovalReason } = {},
	): void {
		if (!notification.isConnected) return;

		this.dispatchNotificationRemoved(notification, reason);

		try {
			notification.hidePopover();
		} catch {
			// notification is already removed from the DOM
		}
		notification.remove();

		if (notification.companionNotification) {
			this.removeNotification(notification.companionNotification, { reason: 'cascade' });
			notification.companionNotification = null;
		}

		const stack = this.notificationStacks.get(notification.position);

		this.removeNotificationFromStack(notification);

		if (shouldReflow && stack && stack.length) {
			this.positionNotifications(notification.position);
		}
	}

	setFocus(element: HTMLElement): void {
		element.focus();
	}

	removeNotificationFromStack(notification: NotificationElement): void {
		const stack = this.notificationStacks.get(notification.position);
		if (!stack) return;

		// Remove matching notification from its position stack.
		const stackIndex = stack.indexOf(notification);
		if (stackIndex !== -1) {
			stack.splice(stackIndex, 1);
		}

		// Drop empty stacks so the map only stores active positions.
		if (stack.length === 0) {
			this.notificationStacks.delete(notification.position);
		}
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
		group,
		position,
		element,
		icon,
		message,
		status,
		button,
		link,
		hasTimer,
		onClose,
		settings,
		data,
	}: NotificationOptions): NotificationElement {
		return this.notification.show({
			group,
			position,
			element,
			icon,
			message,
			status,
			button,
			link,
			hasTimer,
			onClose,
			settings,
			data,
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
