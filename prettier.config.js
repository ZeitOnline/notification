import zonPrettierConfig from '@zeitonline/prettier-config';

/**
 * Note: this picks up the .editorconfig and overrides/extends it.
 * The .editorconfig that should be used can be found at:
 * https://github.com/ZeitOnline/frontend-code-style/blob/main/.editorconfig
 *
 * @type {import('prettier').Options}
 */
export default {
	...zonPrettierConfig,
	useTabs: true, // indent_style = tab
	tabWidth: 4, // indent_size = 4
};
