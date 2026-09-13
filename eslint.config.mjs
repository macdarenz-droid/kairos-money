import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { noFloatMoney } from './scripts/money-rule.mjs';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'android/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: { parserOptions: { project: './tsconfig.json' } },
    plugins: { money: { rules: { 'no-float': noFloatMoney } } },
    rules: { 'money/no-float': 'error', '@typescript-eslint/no-explicit-any': 'error', 'no-restricted-imports': ['error', { paths: [{ name: 'axios', message: 'Financial data must remain local.' }] }] },
  },
  { files: ['src/intelligence/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: ['**/ingest/**', '**/core/db/**'] }] } },
);
