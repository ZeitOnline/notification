import zonEslintConfig from '@zeitonline/eslint-config';
import eslintPluginCompat from 'eslint-plugin-compat';

export default [
	...zonEslintConfig,
	eslintPluginCompat.configs['flat/recommended'],
	{
		settings: {},
	},
	{
		ignores: [],
	},
	{
		rules: {},
	},
];
