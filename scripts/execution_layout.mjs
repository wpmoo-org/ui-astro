/** Fixed container layouts; neither accepts a host-selected filesystem path. */
export function resolveExecutionLayout(mode = 'legacy') {
  if (mode === 'legacy') return {inputs:'/proof', proof:'/proof', cache:'/tmp/npm-cache', output:'/proof'};
  if (mode === 'bridge-v1') return {inputs:'/input', proof:'/work/proof', cache:'/work/npm-cache', output:'/out'};
  throw new Error(`unsupported execution layout: ${mode}`);
}
