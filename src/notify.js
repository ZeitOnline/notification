/**
 * @fileOverview
 * @author daniel.kreitschmann@zeit.de
 * @author joseph.mueller@zeit.de
 * @author moritz.stoltenburg@zeit.de
 * @author valentin.vonguttenberg@zeit.de
 * @version 0.3.0
 */

const CLOSE_BUTTON_HTML = `
	<button class="z-notification-bottom__close-btn" aria-label="Schließen">
		<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M15 15L2.99999 3.00001" stroke="#444444" stroke-width="1.5"/>
			<path d="M15 3.00001L3.00001 15" stroke="#444444" stroke-width="1.5"/>
		</svg>
	</button>`;

// Notify manages ui elements and keep you informed about results, warnings and errors.
// This includes deciding which type of notification to show (e.g., inline or bottom).
class Notify {
	constructor() {
		if (Notify.instance) {
			return Notify.instance;
		}
		Notify.instance = this;
		this.notifications = [];
		this.maxNotifications = 3;
		this.container = null;
		this.notificationTimeout = 4000;
	}
	showBottom({ message, status, button, link }) {
		this.container = this.createBottomContainer();

		let notification = this.createNotification({ message, status, button, link });
		this.notifications.push(notification);

		if (this.notifications.length > this.maxNotifications) {
			this.removeNotification(this.notifications[0]);
		}

		this.container.show();

		this.startTimeout(notification);
	}

	/**
	 * When the container is added to the page, a small delay is required
	 * before setting the innerText, otherwise the screen reader might not announce it correctly.
	 */
	async setAndAnnounceMessage(message) {
		if (!this.container) {
			console.warn('Notification container is not initialized.');
			return;
		}
		this.container.innerText = '';
		await new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, 50);
		});
		this.container.innerText = message;
	}

	async showInline({ element, message }) {
		let inline = { timeoutID: null };
		this.container = this.createInlineContainer();
		await this.setAndAnnounceMessage(message);
		this.inlinePositioning(element, this.container);

		// using pointerup so that simply touching the screen
		// (e.g. by accident or to start scrolling) does not close the notification instantly
		// this gives the user a better chance to read the message
		const clickOutsideListener = event => {
			if (this.container && !this.container.contains(event.target)) {
				this.removeInlineNotification(this.container, inline);
				document.removeEventListener('pointerup', clickOutsideListener);
			}
		};
		document.addEventListener('pointerup', clickOutsideListener);

		// remove notification when user scrolls a certain distance
		const lastScrollY = window.scrollY;
		const scrollListener = () => {
			if (Math.abs(window.scrollY - lastScrollY) > 100) {
				this.removeInlineNotification(this.container, inline);
				document.removeEventListener('scroll', scrollListener);
			}
		};
		document.addEventListener('scroll', scrollListener, {
			passive: true,
		});

		inline.timeoutID = setTimeout(
			() => this.removeInlineNotification(this.container, inline),
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
	createInlineContainer() {
		let container = document.querySelector('.z-notification-inline');
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

	createBottomContainer() {
		let container = document.querySelector('.z-notification-bottom');
		if (!container) {
			container = document.createElement('dialog');
			container.className = 'z-notification-bottom';
			document.body.insertAdjacentElement('beforeend', container);
		}
		return container;
	}

	createNotification({ message, status, button, link }) {
		const notification = document.createElement('div');
		notification.className = `z-notification-bottom__item ${status === 'error' ? 'z-notification-bottom__item--state-error' : ''}`;
		notification.setAttribute('role', 'alert');
		notification.setAttribute('aria-live', 'assertive');

		if (!button && !link) {
			notification.classList.add('z-notification-bottom__item--no-action');
		}

		let actionHtml = '';

		if (link) {
			actionHtml = `<a href="${link.href}" class="z-notification-bottom__action-btn" role="link">${link.text}</a>`;
		} else if (button) {
			actionHtml = `<button class="z-notification-bottom__action-btn" role="button">${button.text}</button>`;
		}

		notification.innerHTML = `${CLOSE_BUTTON_HTML}<p class="z-notification-bottom__message">${message}</p>${actionHtml}`;
		this.container.appendChild(notification);

		if (button && button.onClick) {
			const actionElement = notification.querySelector('.z-notification-bottom__action-btn');
			actionElement.onclick = () => {
				button.onClick();
				this.removeNotification(notification);
			};
		}

		const closeButton = notification.querySelector('.z-notification-bottom__close-btn');
		closeButton.onclick = () => this.removeNotification(notification);

		notification.isPaused = false;
		this.addPauseResumeEvents(notification);

		return notification;
	}

	inlinePositioning(element, container) {
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

	startTimeout(notification) {
		notification.timeoutID = setTimeout(() => {
			if (!notification.isPaused) {
				this.removeNotification(notification);
			}
		}, this.notificationTimeout);
	}

	addPauseResumeEvents(notification) {
		const pause = () => {
			notification.isPaused = true;
			clearTimeout(notification.timeoutID);
		};

		const resume = () => {
			notification.isPaused = false;
			this.startTimeout(notification);
		};

		notification.addEventListener('pointerenter', pause);
		notification.addEventListener('pointerleave', resume);
	}

	removeNotification(notification) {
		if (!notification) return;

		notification.remove();
		this.notifications = this.notifications.filter(t => t !== notification);

		clearTimeout(notification.timeoutID);

		if (this.notifications.length === 0 && this.container.open) {
			this.container.close();
		}
	}

	removeInlineNotification(container, inline) {
		clearTimeout(inline.timeoutID);
		container.remove();
	}
}

const notify = {
	notify: new Notify(),
	showInline({ message, element }) {
		this.notify.showInline({ message, element });
	},
	showBottom({ message, status, button, link }) {
		this.notify.showBottom({ message, status, button, link });
	},
};

// for debugging purposes in zeit.web
if(window.Zeit){
	window.Zeit.notify = notify;
}

export default notify;
