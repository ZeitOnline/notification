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
	message: 'The article was saved.',
	link: {
		text: 'Open reading list',
		href: 'https://example.com/account/reading-list',
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
		message: 'The article was saved.',
		status: 'success',
	});
});
```

When `element` is provided for a toast, the notification is inserted after the trigger and any already-rendered notification siblings, and the stack is reflowed from there. If `element` is omitted and a direct child element is focused, the notification is inserted after that element instead of being appended to the end of the body.

## Screen reader announcements

Notifications are announced through hidden ARIA live regions. Regular notifications use a polite live region, while `status: 'error'` uses an assertive live region.

Announcements are queued per live-region politeness level. Each message stays in the live region for at least 1.5 seconds and at most 4 seconds, with longer messages receiving proportionally more time. This pacing is intentionally conservative: typical spoken output is often around 150-180 words per minute, while experienced screen-reader users may use 300 words per minute or faster. The queue prevents rapid notification bursts from overwriting earlier announcements before assistive technologies have time to speak them.

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
	message: 'The article was removed from your reading list.',
	button: {
		text: 'Undo',
		onClick: () => {
			console.log('Undo');
		},
	},
});
```

## What the package provides

- Notifications with `top`, `top-right` and `bottom` placement.
- Notifications can be anchored next to the triggering element for better reading order.
- Status variants for `success`, `warning`, `info` and `error`.
- Optional action button or link.
- Inline notifications anchored to the element that triggered them.
- Queued screen-reader announcements with separate polite and assertive live regions.
- Optional `group` keys to replace earlier notifications within the same position stack.
- Auto-dismiss after the configured duration, with pause and resume on pointer hover, when `hasTimer` is set to `true`.
- Notifications emit `notification-shown`, `notification-action` and `notification-removed` custom events on `window` over their whole lifecycle, so consumers can observe them without touching the call sites. See [Lifecycle events](#lifecycle-events).
- Stacking of up to 3 notifications per position at the same time.
- Optional `settings.url` on timed notifications: when no stored auto-dismiss duration preference exists yet, shows a companion notification with a configurable call-to-action that opens the provided URL in a new tab. Dismissing that hint stores `z.notification.hint` for two days.

## Lifecycle events

Every notification reports its own lifecycle through custom events on `window`, and `show()`
returns the notification element. This keeps concerns such as analytics out of the call sites:
listen once, and every notification in the application is covered, including the auto-dismiss
hint the package shows on its own.

```js
window.addEventListener('notification-shown', ({ detail }) => {
	// detail.notification is already in the DOM
});

window.addEventListener('notification-action', ({ detail }) => {
	// the link or the callback button was activated
});

window.addEventListener('notification-removed', ({ detail }) => {
	if (detail.reason === 'close') {
		// the user actively dismissed it, rather than the timer running out
	}
});
```

All three events share the same `detail` shape:

| Field          | Description                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `notification` | The notification element. Still in the DOM in `notification-removed`.                              |
| `originator`   | The element the notification is anchored to.                                                       |
| `group`        | The `group` the notification was shown with, or `null`.                                            |
| `status`       | `success`, `warning`, `info` or `error`.                                                           |
| `hasTimer`     | Whether an auto-dismiss timer is actually running.                                                 |
| `duration`     | The effective auto-dismiss duration in milliseconds, or `undefined` when no timer runs.             |
| `actionType`   | `link` or `button`, or `undefined` when the notification has no action.                             |
| `isCompanion`  | `true` for companion notifications such as the auto-dismiss hint.                                   |
| `data`         | Whatever was passed as the `data` option, untouched.                                                |

`notification-removed` adds a `reason`, so consumers can tell a deliberate dismissal from the
timer running out:

| Reason          | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| `close`         | The user clicked the close button.                          |
| `timeout`       | The auto-dismiss timer expired.                             |
| `action`        | The action button ran its callback.                         |
| `replaced`      | A newer notification of the same `group` took its place.    |
| `evicted`       | The position stack was full.                                |
| `cascade`       | The parent notification was removed.                        |
| `programmatic`  | Removed through the API without a more specific reason.     |

### Passing your own data through

`show()` accepts an opaque `data` object. The package never reads it; it is stored on the
notification element and echoed back in every event detail, so consumers can carry their own
context without the package knowing what it means.

```js
notification.show({
	group: 'bookmark',
	message: 'The article was saved.',
	data: { myOwnContext: 'whatever the consumer needs' },
});
```

### Stable DOM hooks

The notification's parts carry `data-notification-part` attributes (`icon`, `message`, `action`,
`close`), which are a safer selector target than the styling class names.

## Updates

Take a look at the [CHANGELOG.md](./CHANGELOG.md) to see what changed in the latest releases.

## Contact

If you want to give feedback about the package, write to [zon-frontend@zeit.de](mailto:zon-frontend@zeit.de).
