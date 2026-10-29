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
];
