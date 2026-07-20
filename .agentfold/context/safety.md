# Safety

## Excluded paths

- `.env`
- `.env.*`
- `**/secrets/**`
- `**/*.pem`
- `**/*.key`
- `**/credentials.json`

## Baseline rules

- Do not reveal secrets or copy secret values into generated context.
- Do not edit generated outputs unless explicitly allowed.
- Require confirmation before destructive commands.
- Respect repository boundaries and `.gitignore`.

## Repository-specific rules

<!-- Add sensitive paths and prohibited operations for this repository. -->
