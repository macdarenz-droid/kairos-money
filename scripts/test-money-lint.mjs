import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { noFloatMoney } from './money-rule.mjs';
const eslint = new ESLint({ overrideConfigFile:true, overrideConfig:[{files:['tests/money-rule-fixture.ts'],languageOptions:{parser:tseslint.parser,parserOptions:{project:'./tsconfig.json'}},plugins:{money:{rules:{'no-float':noFloatMoney}}},rules:{'money/no-float':'error'}}] });
const [result]=await eslint.lintFiles(['tests/money-rule-fixture.ts']);
assert.equal(result.errorCount,2);assert.deepEqual(result.messages.map(m=>m.line),[3,4]);
console.log('Money ESLint regression: 2 unsafe numeric operations rejected; bigint operation accepted.');
