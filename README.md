<div align="center">

<img src="https://assets.codepen.io/t-1493/logo-meerkat.png" width="180" alt="" />

# **Notification**

Notifications keep you informed about results, warnings and errors.

</div>

## Installing the notification package

Install the package together with the ZEIT ONLINE design system, because the notification styles use design-system variables:

```sh
npm install @zeitonline/notification @zeitonline/design-system
# or
yarn add @zeitonline/notification @zeitonline/design-system
```

## Recommendation

A practical setup is to copy both CSS files from `node_modules` into your application styles directory and load them from there.

```json
{
	"scripts": {
		"copy:zds": "mkdir -p ./src/assets/css && cp node_modules/@zeitonline/design-system/design-system.css ./src/assets/css/design-system.css",
		"copy:notification": "mkdir -p ./src/assets/css && cp node_modules/@zeitonline/notification/dist/notification.css ./src/assets/css/notification.css"
	}
}
```

Then include the styles in this order:

```html
<link rel="stylesheet" href="./src/assets/css/design-system.css" />
<link rel="stylesheet" href="./src/assets/css/notification.css" />
```

## Usage

```js
import notification from '@zeitonline/notification';

notification.show({
	status: 'success',
	message: 'Der Artikel wurde gespeichert.',
	link: {
		text: 'Merkliste öffnen',
		href: 'https://www.zeit.de/konto/listen/merkliste',
	},
});

const trigger = document.querySelector('[data-copy-link]');

trigger?.addEventListener('click', () => {
	notification.showInline({
		element: trigger,
		message: 'Link copied to clipboard.',
	});

	notification.show({
		element: trigger,
		message: 'Der Artikel wurde gespeichert.',
		status: 'success',
	});
});
```

When `element` is provided for a bottom toast, the notification is inserted as the trigger's next sibling and the stack is reflowed from there.

If you use the `icon` option, the notification expects an SVG symbol in the page with the id pattern `svg-<name>`.

```html
<svg aria-hidden="true" style="display:none">
	<symbol id="svg-bookmark" viewBox="0 0 18 18">
		<path d="..." />
	</symbol>
</svg>
```

```js
notification.show({
	icon: 'bookmark',
	message: 'Der Artikel wurde von der Merkliste entfernt.',
	button: {
		text: 'Rückgängig',
		onClick: () => {
			console.log('Undo');
		},
	},
});
```

## Notification settings

You can let users configure how long notifications are displayed by initialising a settings form with `initNotificationSettings`.

The chosen duration is saved to `localStorage` and automatically used the next time the `Notification` class is instantiated. If no value has been saved, `DEFAULT_TIMEOUT_MS` (3500 ms) is used.

```js
import { initNotificationSettings } from '@zeitonline/notification';

const form = document.querySelector('.z-notification-settings');
if (form) {
	initNotificationSettings(form, () => {
		// Called after the value is saved — show your own confirmation here.
		notification.showInline({ message: 'Einstellungen gespeichert', element: form });
	});
}
```

The form must contain radio inputs with `name="notification-timeout"` and numeric `value` attributes (duration in milliseconds):

```html
<form class="z-notification-settings" aria-describedby="z-notification-settings-desc" onsubmit="return false">
        <fieldset class="z-notification-settings__fieldset">
            <legend class="z-notification-settings__legend">Optionale Hinweise automatisch ausblenden:</legend>
            <div class="z-notification-settings__item">
                <label class="z-notification-settings__label">
                    <input class="z-notification-settings__radio" type="radio" name="notification-timeout" value="0" required>
                    nie, immer manuell wegklicken
                </label>
            </div>
            <div class="z-notification-settings__item">
                <label class="z-notification-settings__label">
                    <input class="z-notification-settings__radio" type="radio" name="notification-timeout" value="3000" checked>
                    nach 3 Sekunden
                </label>
            </div>
            <div class="z-notification-settings__item">
                <label class="z-notification-settings__label">
                    <input class="z-notification-settings__radio" type="radio" name="notification-timeout" value="6000">
                    nach 6 Sekunden
                </label>
            </div>
            <div class="z-notification-settings__item">
                <label class="z-notification-settings__label">
                    <input class="z-notification-settings__radio" type="radio" name="notification-timeout" value="12000">
                    nach 12 Sekunden
                </label>
            </div>
            <div class="z-notification-settings__item">
                <label class="z-notification-settings__label">
                    <input class="z-notification-settings__radio" type="radio" name="notification-timeout" value="24000">
                    nach 24 Sekunden
                </label>
            </div>
        </fieldset>
        <button class="z-notification-settings__submit z-button z-button--primary" type="submit">Speichern</button>
</form>
```

The `onSaved` callback is optional. If omitted, the value is still saved silently.

## What the package provides

- Bottom notifications with `top` or `bottom` placement.
- Bottom notifications can be anchored next to the triggering element for better reading order.
- Status variants for `success`, `warning`, `info` and `error`.
- Optional action button or link.
- Inline notifications anchored to the element that triggered them.
- Accessible live regions: bottom notifications use `role="alert"`, inline notifications use `role="status"`.
- Auto-dismiss after 4 seconds, with pause and resume on pointer hover, when timer property is set to true.
- Timed notifications can emit the `notification-removed` custom event when they close.
- Stacking of up to 3 bottom notifications at the same time.
- User-configurable display duration via `initNotificationSettings`, persisted in `localStorage`.

## Updates

Take a look at the [CHANGELOG.md](./CHANGELOG.md) to see what changed in the latest releases.

## Contact

If you want to give feedback about the package, write to [zon-frontend@zeit.de](mailto:zon-frontend@zeit.de).
