# Contributing to AZ Cost Assessment

Thank you for helping improve this project.

## Ground rules

- Be respectful and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Use least-privilege and never commit credentials or subscription secrets
- Keep changes focused, testable, and documented

## Development workflow

1. Fork and create a feature branch from `main`
2. Install dependencies with `npm ci`
3. Run checks before opening a pull request:
   - `npm run typecheck`
   - `npm run build`
   - `npm test`
4. Configure a GitHub-registered signing key, then sign your commits (`git commit -S -m "your message"`). CI requires GitHub to verify each signature.
5. Open a pull request using the provided template

## Commit and branch policy

- Pull requests to `main` are required
- Signed commits are required for merges
- At least one approving review is required
- Required branch-protection checks currently include both legacy build jobs, security and commit signature validation. CodeQL also runs; see [the housekeeping plan](docs/repository-health.md) for the supported-Node check migration.

## Coding expectations

- Preserve existing project structure and naming conventions
- Add or update tests when behavior changes
- Update docs when config, output, or workflows change
- Keep generated artifacts out of git (`reports/`, `logs/`, temporary query files)

## Reporting problems

- Bug reports and feature requests: use GitHub issue templates
- Security vulnerabilities: follow [SECURITY.md](SECURITY.md) and use private disclosure
