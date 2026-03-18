export type ButtonOptions = {
	text: string;
	onClick: () => void;
};

export type LinkOptions = {
	text: string;
	href: string;
};

export type BottomNotificationOptions = {
	message: string;
	status?: 'error' | 'success' | 'warning' | 'info';
	button?: ButtonOptions;
	link?: LinkOptions;
};

export type InlineNotificationOptions = {
	message: string;
	element: HTMLElement;
};

export type InlineNotification = {
	timeoutID: number | null;
};

export interface NotificationElement extends HTMLElement {
	isPaused: boolean;
	timeoutID: number;
	elapsed: number;
	startedAt: number;
}

export type NotificationService = {
	notification: InstanceType<typeof import('./src/notification').Notification>;
	showInline(options: InlineNotificationOptions): Promise<void>;
	showBottom(options: BottomNotificationOptions): void;
	debug(): void;
};

declare global {
	interface Window {
		Zeit?: {
			notification?: NotificationService;
		};
	}
}
