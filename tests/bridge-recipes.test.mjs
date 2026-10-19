import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExecutionLayout } from '../scripts/execution_layout.mjs';
import { validateBridgeMatrix, prepareBridgeRecipe, runBridgeRecipe } from '../scripts/bridge_recipes.mjs';

test('bridge layout separates inputs, scratch and output', () => {
  assert.deepEqual(resolveExecutionLayout('bridge-v1'), {
    inputs:'/input', proof:'/work/proof', cache:'/work/npm-cache', output:'/out',
  });
  assert.equal(resolveExecutionLayout('legacy').proof, '/proof');
  assert.equal(resolveExecutionLayout('legacy').cache, '/tmp/npm-cache');
  assert.throws(() => resolveExecutionLayout('host'), /unsupported/);
});
test('every declared SDK and Starter profile and byte assertion is required', () => {
  const ids = ['default','theme','ui-only','page-only','post-only','mdx','external-plugin','taxonomy','external-taxonomy','content-editing','not-found','not-found-host'];
  const artifact = {filename:'sdk.tgz',sha256:'a'.repeat(64),files:{'file.js':'b'.repeat(64)}};
  const profiles = Object.fromEntries(ids.map(id => [id, {archive_sha256:artifact.sha256, authored_before:{'src/a':'c'}, authored_after:{'src/a':'c'},steps:{install:{exit_code:0},check:{exit_code:0},build:{exit_code:0}},dist:{'index.html':'d'},private_errors:{}}]));
  const result = {profiles, incompatible_peer:{code:'ERESOLVE',exit_code:1}};
  assert.equal(validateBridgeMatrix('consumers',result,{'@wpmoo/astro':artifact}).length,12);
  const missing = structuredClone(result);delete missing.profiles.theme;
  assert.throws(() => validateBridgeMatrix('consumers',missing,{'@wpmoo/astro':artifact}), /profiles/);
  const tamper = structuredClone(result);tamper.profiles.default.authored_after['src/a']='tampered';
  assert.throws(() => validateBridgeMatrix('consumers',tamper,{'@wpmoo/astro':artifact}));
  assert.equal(typeof prepareBridgeRecipe,'function');assert.equal(typeof runBridgeRecipe,'function');
});
