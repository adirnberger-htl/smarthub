# Branch & Release Workflow Rules

- **`main` is the Protected Release Branch**:
  - NEVER commit or push directly to `main`.
  - `main` only receives stable release merges from `dev` via Pull Request.
  - Never force-push or delete `main`.
- **`dev` is the Default Development Branch**:
  - All ongoing development, bug fixes, and OpenSpec changes must happen on `dev` (or feature branches branched off `dev`).
  - Before starting work or committing changes, verify the active branch is NOT `main` (`git branch --show-current`). If on `main`, switch to `dev` first.
