type TextOptions = {
	text: string;
};

export type ButtonOptions = TextOptions & {
	onClick: () => void;
};

export type LinkOptions = TextOptions & {
	href: string;
};

export type NotificationPosition = 'top' | 'bottom' | 'top-right';

export type NotificationOptions = {
	group?: string | null;
	position?: NotificationPosition;
	element?: HTMLElement;
	icon?: string;
	message: string;
	status?: 'error' | 'success' | 'warning' | 'info';
	button?: ButtonOptions;
	link?: LinkOptions;
	hasTimer?: boolean;
	onClose?: (() => void) | null;
};

export type InlineNotificationOptions = {
	message: string;
	element: HTMLElement;
};

export type InlineNotification = {
	timeoutID: ReturnType<typeof setTimeout> | null;
};

export interface NotificationElement extends HTMLElement {
	group: string | null;
	hasTimer: boolean;
	isPaused: boolean;
	position: NotificationPosition;
	timeoutID: ReturnType<typeof setTimeout> | null;
	elapsed: number;
	startedAt: number;
	remaining: number;
	anchorElement: HTMLElement;
	onClose?: (() => void) | null;
}

export type NotificationService = {
	notification: InstanceType<typeof import('./src/notification').Notification>;
	showInline(options: InlineNotificationOptions): Promise<void>;
	show(options: NotificationOptions): void;
	debug(): void;
};

declare global {
	interface Window {
		Zeit?: {
			notification?: NotificationService;
		};
	}
}
