export type ButtonOptions = {
	text: string;
	onClick: () => void;
};

export type LinkOptions = {
	text: string;
	href: string;
};

export type NotificationPosition = 'top' | 'bottom' | 'top-right';

export type NotificationOptions = {
	type?: string;
	position?: NotificationPosition;
	element?: HTMLElement;
	icon?: string;
	message: string;
	status?: 'error' | 'success' | 'warning' | 'info';
	button?: ButtonOptions;
	link?: LinkOptions;
	hasTimer?: boolean;
};

export type InlineNotificationOptions = {
	message: string;
	element: HTMLElement;
};

export type InlineNotification = {
	timeoutID: ReturnType<typeof setTimeout> | null;
};

export interface NotificationElement extends HTMLDivElement {
	type: string | null;
	hasTimer: boolean;
	isPaused: boolean;
	timeoutID: ReturnType<typeof setTimeout> | null;
	elapsed: number;
	startedAt: number;
	anchorElement: HTMLElement;
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
