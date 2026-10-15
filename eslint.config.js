import zonEslintConfig from '@zeitonline/eslint-config';
import eslintPluginCompat from 'eslint-plugin-compat';

export default [
	...zonEslintConfig,
	...zonEslintConfig.ts,
	eslintPluginCompat.configs['flat/recommended'],
	{
		settings: {},
	},
	{
		ignores: [],
	},
	{
		rules: {
			// typescript-eslint replaces the base no-unused-vars rule, so keep the shared options
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrors: 'none' },
			],
		},
	},
];
