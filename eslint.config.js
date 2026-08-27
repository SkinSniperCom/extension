// Standalone config mirroring the SkinSniper monorepo's shared ESLint setup
// (js recommended + typescript recommended + stylistic customize), so this
// directory lints identically inside the monorepo and as its own repo.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import typescript from 'typescript-eslint';

const style = stylistic.configs.customize({ indent: 2, quotes: 'single', semi: true });
for (const name in style.rules) {
  const value = style.rules[name];
  if (value === 'error') style.rules[name] = 'warn';
  else if (value?.[0] === 'error') value[0] = 'warn';
}
style.rules = {
  ...style.rules,
  '@stylistic/arrow-parens': ['warn', 'always'],
  '@stylistic/member-delimiter-style': [
    'warn', {
      multiline: { delimiter: 'comma' },
      singleline: { delimiter: 'comma' },
    }],
  '@stylistic/brace-style': ['warn', '1tbs'],
};

export default defineConfig([
  js.configs.recommended,
  typescript.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  style,
  globalIgnores(['dist', 'dist-firefox']),
]);
