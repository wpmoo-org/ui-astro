# Security Policy

## Scope and Supported Versions

Moo UI Astro provides the SDK in `packages/astro`, its development demo in
`apps/demo`, and repository verification tooling. The SDK is currently an
unpublished `0.1.0` candidate. Fixes are prepared against the current `dev`
branch; no published stable support line is claimed here.

The underlying Moo UI Core package has its own
[security policy](https://github.com/wpmoo-org/ui/security/policy).
Reports about its impact through this adapter are welcome here as well.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Use **Report a vulnerability** on this repository's
[Security page](https://github.com/wpmoo-org/ui-astro/security) to contact the
maintainer privately. Include:

- the affected commit or package archive and Moo UI Core version;
- the public entrypoint, rendered page or build command involved;
- a minimal reproduction and the expected and observed impact;
- relevant Node, Astro, browser and deployment details.

Do not include live credentials or private host content in a public report.
The maintainer will assess credible reports and coordinate a fix or mitigation
before public disclosure when appropriate.

## Security Boundaries

The host owns its application configuration, content sources, MDX and plugins.
MDX, plugins and application configuration execute as trusted application code;
the SDK does not provide a sandbox for hostile executable content.

Report reachable SDK defects that allow unsafe rendered output or navigation,
exposure of nonpublic content through generated routes or metadata, unintended
file access, or compromise of the build, package or verification workflow.
Include a practical impact path for dependency findings. No finding class is
excluded solely because it involves a dependency or host integration.
