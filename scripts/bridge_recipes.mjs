/** Product assertions reused by the fixed offline bridge; no Docker controller calls. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveExecutionLayout } from './execution_layout.mjs';
import { archiveRecord } from './prepare_astro_starter.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONSUMER_PROFILES = Object.freeze(['default','theme','ui-only','page-only','post-only','mdx','external-plugin','taxonomy','external-taxonomy','content-editing','not-found','not-found-host']);
export const STARTER_PROFILES = Object.freeze(['en-category','de-category','en-short','de-short','en-root','de-root']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const env = () => ({PATH:'/usr/local/bin:/usr/bin:/bin', HOME:'/work/home', TMPDIR:'/work/tmp', LANG:'C.UTF-8', CI:'true',
  npm_config_cache:'/work/npm-cache', npm_config_offline:'true', npm_config_ignore_scripts:'true',
  npm_config_userconfig:'/dev/null',npm_config_globalconfig:'/dev/null',npm_config_audit:'false',npm_config_fund:'false',
  ASTRO_TELEMETRY_DISABLED:'1',WPMOO_EXECUTION_LAYOUT:'bridge-v1'});

async function execute(command, args, cwd, output) {
  const result = spawnSync(command, args, {cwd, env:env(), encoding:'utf8', maxBuffer:16*1024*1024});
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  await appendFile(join(output, 'run.log'), text);
  assert.equal(result.status, 0, `offline recipe failed: ${command}; ${text.slice(-4000)}`);
  return text;
}

export function validateBridgeMatrix(suite, result, artifacts) {
  const expected = suite === 'consumers' ? CONSUMER_PROFILES : suite === 'starter' ? STARTER_PROFILES : [];
  assert.ok(expected.length, 'unsupported matrix suite');
  assert.deepEqual(Object.keys(result.profiles), [...expected], 'all registered profiles required');
  const sdk = artifacts['@wpmoo/astro'];
  assert.ok(sdk?.sha256 && Object.keys(sdk.files).length, 'exact SDK archive inventory required');
  for (const [name, profile] of Object.entries(result.profiles)) {
    assert.deepEqual(profile.authored_after, profile.authored_before, `${name}: authored bytes changed`);
    assert.ok(Object.keys(profile.authored_before).length, 'authored inventory required');
    const commands = suite === 'consumers' ? profile.steps : profile.commands;
    for (const name of ['install','check','build']) assert.equal(commands[name]?.exit_code, 0, `${name}: native command required`);
    if (suite === 'consumers') {
      assert.equal(profile.archive_sha256, sdk.sha256, 'exact installed archive identity required');
      assert.ok(Object.keys(profile.dist).length, 'compiled output required');
    } else {
      assert.deepEqual(profile.installed.packages['@wpmoo/astro'].files, sdk.files, 'all installed SDK bytes required');
      assert.ok(Object.keys(profile.output.html).length, 'compiled canonical routes required');
    }
  }
  if (suite === 'consumers') {
    assert.equal(result.incompatible_peer?.code, 'ERESOLVE');
    assert.notEqual(result.incompatible_peer?.exit_code, 0);
  }
  return [...expected];
}

async function packSdk(output, packing) {
  await mkdir(packing, {recursive:true});
  const result = JSON.parse(await execute('npm',['pack','--ignore-scripts','--offline','--pack-destination',packing,'--json'],join(REPO,'packages/astro'),output))[0];
  const archive = join(packing,result.filename);
  const record = await archiveRecord(archive);
  const surface = await readJson(join(REPO,'packages/astro/contracts/astro-public-surface.json'));
  assert.deepEqual(Object.keys(record.files).sort(), [...surface.files].sort(), 'exact public package inventory');
  assert.deepEqual(record.manifest.exports, surface.exports, 'exact public package exports');
  for (const [name, digest] of Object.entries(record.files)) assert.equal(hash(await readFile(join(REPO,'packages/astro',name))), digest, 'packed source identity');
  return {archive,record};
}

export async function prepareBridgeRecipe({suite, variant, manifest, layout}) {
  assert.deepEqual(layout, resolveExecutionLayout('bridge-v1'), 'fixed bridge layout required');
  assert.ok(['consumers','starter'].includes(suite), 'unsupported matrix suite');
  assert.ok(suite === 'starter' ? ['native','content-owned'].includes(variant) : variant === 'native', 'unsupported variant');
  let prepared;
  if (suite === 'consumers') {
    await execute('npm',['ci','--offline','--ignore-scripts','--no-audit','--no-fund'],REPO,layout.output);
    const {preparePackedConsumerInputs} = await import('./verify_packed_consumer.mjs');
    prepared = await preparePackedConsumerInputs({outputPath:layout.proof});
    // The controller's TypeScript parser is loaded. Test consumers receive their
    // own locked installations; root tooling dependencies need no scratch copy.
    await rm(join(REPO,'node_modules'), {recursive:true, force:true});
  } else {
    const {archive,record} = await packSdk(layout.output,'/work/packing');
    const lockPath = join(REPO,'tests/fixtures/astro-starter/package-lock.json');
    const original = await readFile(lockPath);
    const seed = JSON.parse(original);
    assert.equal(seed.packages['node_modules/@wpmoo/astro'].version, record.manifest.version);
    seed.packages['node_modules/@wpmoo/astro'].integrity = record.integrity;
    const preparedLock = '/work/packing/starter-lock.json';
    await writeFile(preparedLock,JSON.stringify(seed));
    const {prepareStarterInputs} = await import('./verify_astro_starter.mjs');
    prepared = await prepareStarterInputs({sdkArchive:archive,lockPath:preparedLock,breadcrumbProfile:variant,
      sourceCommit:'client-reported-unavailable',starterCommit:'client-reported-unavailable'},
      {starterPath:join('/work/source',manifest.deployable_path),outputPath:layout.proof});
    prepared.request.preparation.lockSeedOriginalSha256 = hash(original);
    prepared.request.preparation.lockSeedMode = 'prepared-sdk-integrity';
    await writeFile(join(layout.proof,'request.json'),JSON.stringify(prepared.request));
  }
  return {request:prepared.request, variant};
}

export async function runBridgeRecipe({suite, prepared, layout}) {
  await execute(process.execPath,[join(layout.proof,'run_packed_consumer.mjs'),join(layout.proof,'request.json')],layout.proof,layout.output);
  const file = suite === 'consumers' ? 'runner-result.json' : 'proof.json';
  const result = await readJson(join(layout.proof,file));
  const artifacts = prepared.request.artifacts;
  const ids = validateBridgeMatrix(suite,result,artifacts);
  const retained = ['request.json',file,...Object.values(artifacts).map(record => record.filename)];
  await mkdir(join(layout.output,'evidence'),{recursive:true});
  for (const record of Object.values(artifacts)) assert.equal(hash(await readFile(join(layout.proof,record.filename))),record.sha256,'retained artifact digest');
  for (const name of retained) await cp(join(layout.proof,name),join(layout.output,'evidence',name));
  return {version:1,suite,native_exit:0,profiles:ids.map(id => ({id,passed:true})),
    assertions:{complete:true,authored_identity:true,installed_identity:true,offline_native_commands:true},
    artifacts:retained.map(name => `evidence/${name}`),
    preparation:{variant:prepared.variant,scope:'prepared-copy; no rendered/deployed or unchanged-source certification'}};
}
