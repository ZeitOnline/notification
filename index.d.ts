type TextOptions = {
	text: string;
};

export type ButtonOptions = TextOptions & {
	onClick: () => void;
};

export type LinkOptions = TextOptions & {
	href: string;
};

export type SettingsOptions = {
	url: string;
	/** Custom copy for the companion hint shown before opening settings. */
	message?: string;
	buttonText?: string;
	openingMessage?: string;
};

export type NotificationPosition = 'top' | 'bottom' | 'top-right';

export type NotificationStatus = 'error' | 'success' | 'warning' | 'info';

/** Whether the notification's action is a link or a callback button. */
export type NotificationActionType = 'link' | 'button';

/** Why a notification was removed. See the reason table in the README. */
export type NotificationRemovalReason =
	| 'close'
	| 'timeout'
	| 'action'
	| 'replaced'
	| 'evicted'
	| 'cascade'
	| 'programmatic';

export type NotificationOptions = {
	group?: string | null;
	position?: NotificationPosition;
	element?: HTMLElement;
	icon?: string;
	message: string;
	status?: NotificationStatus;
	button?: ButtonOptions;
	link?: LinkOptions;
	hasTimer?: boolean;
	onClose?: (() => void) | null;
	settings?: SettingsOptions;
	/**
	 * Arbitrary data the caller wants to associate with this notification.
	 * The package never reads it; it is stored on the notification element and
	 * echoed back in every lifecycle event detail.
	 */
	data?: Record<string, unknown>;
};

export type InlineNotificationOptions = {
	message: string;
	element: HTMLElement;
};

export type InlineNotification = {
	timeoutID: ReturnType<typeof setTimeout> | null;
};

/** Payload shared by all notification lifecycle events. */
export type NotificationEventDetail = {
	originator: HTMLElement;
	notification: NotificationElement;
	group: string | null;
	status: NotificationStatus;
	/** Whether an auto-dismiss timer is actually running. */
	hasTimer: boolean;
	/** The configured auto-dismiss duration in milliseconds, if any. */
	duration?: number;
	actionType?: NotificationActionType;
	/** Whether this is a companion notification, such as the auto-dismiss hint. */
	isCompanion: boolean;
	data?: Record<string, unknown>;
};

export type NotificationRemovedEventDetail = NotificationEventDetail & {
	reason: NotificationRemovalReason;
};

export interface NotificationElement extends HTMLElement {
	group: string | null;
	status: NotificationStatus;
	hasTimer: boolean;
	isPaused: boolean;
	position: NotificationPosition;
	timeoutID: ReturnType<typeof setTimeout> | null;
	elapsed: number;
	startedAt: number;
	remaining?: number;
	duration?: number;
	actionType?: NotificationActionType;
	isCompanion: boolean;
	data?: Record<string, unknown>;
	anchorElement: HTMLElement;
	onClose?: (() => void) | null;
	companionNotification?: NotificationElement | null;
}

export type NotificationService = {
	notification: InstanceType<typeof import('./src/notification').Notification>;
	showInline(options: InlineNotificationOptions): Promise<void>;
	show(options: NotificationOptions): NotificationElement;
	debug(): void;
};

declare global {
	interface Window {
		Zeit?: {
			notification?: NotificationService;
		};
	}

	interface WindowEventMap {
		'notification-shown': CustomEvent<NotificationEventDetail>;
		'notification-action': CustomEvent<NotificationEventDetail>;
		'notification-removed': CustomEvent<NotificationRemovedEventDetail>;
	}
}
