# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:


## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

# PMS Baseline

Publications Management System baseline for SE3002 Assignment 01.

## Run

```bash
npm install
npm run api
npm run dev
```

Run `npm run api` in one terminal and `npm run dev` in another. The API stores data in `server/data.json`, issues session tokens, and enforces role permissions server-side. This is a local test database; replace it with Firebase/Firestore or a production database before deployment.

## Demo accounts

The demo accounts use `password123`. New accounts can be requested from the sign-in screen and are stored in the local API database. Passwords are salted `scrypt` hashes and are never returned by the API. Production can replace this local API with Firebase Authentication and Firestore.

- `amina`: Publisher, Computer Science
- `omar`: Moderator, Computer Science
- `nora`: Member, Linguistics
- `admin`: Administrator

## Selected requirement coverage

- Register: account request form, duplicate username rejection, pending approval feedback.
- Internet/VUB login: role login flow and visible VUB-network recognition toggle.
- Search: keyword, `AND`/`OR`/`NOT`, author, and date-range filtering with empty/error feedback.
- Own publications/upload: publisher workspace, owner-scoped list, upload and metadata confirmation flow.
- Manage users: search users and role changes, including Moderator department and role limits.
- Manage groups: create/search/delete group, with the non-empty deletion guard.
- Manage user level: Moderator `Member <-> Publisher` department rule and Administrator unrestricted role control.
- Security: session tokens, salted `scrypt` password hashes, server-side role boundaries, and password fields; production deployment must add HTTPS and account approval/email verification.
- Availability: operational status, graceful empty/error feedback, and local persistence; outage recovery needs a separate runtime test.
- Maintainability: modular React components and npm build/lint scripts.

## Evidence note

This is the first runnable baseline. Freeze this version before later defect fixes, then collect SonarQube output from the complete repository and execute the assignment's 12–15 test cases against the frozen build.
