# ADR-0004: Use the company web stack for the pages and plain TypeScript in web pages

Status: Accepted.
Date: 2026-10-11.

## Context

The company web guide (`fintermobilityas/company`, `docs/web-apps.md`) sets
Vue 3, TypeScript, Vite and Tailwind 4 for applications. An extension has
three parts with different rules:

- The popup and the options page are small applications.
- The background has no user interface.
- The content script runs in each web page and frame. It must be small and
  must not change the page.

## Decision

The popup and the options page use Vue 3 with `<script setup lang="ts">`,
Vite and Tailwind 4. The design tokens come from Flis, the design of the Nodkey
app (`peters/nodkey`, `docs/design/flis-spec.md`).

The background and the content script use plain TypeScript without Vue. The
content script is one classic script without imports, because browsers load
content scripts that way. Its user interface is in a closed shadow root. The
page styles cannot change it, and page scripts cannot read it.

TypeScript is 6.0. TypeScript 7 is available, but `typescript-eslint` does not
support it yet.

The interface uses the twelve languages of the Nodkey app with the browser's
`_locales` system. The text is in `src/i18n/messages/<language>.json`.

## Consequences

- The quality gate is `npm run validate`: lint, format check, type checks,
  tests and the production build.
- The content script is approximately 16 KB.
- The dark theme uses a lighter red for destructive actions than the Flis
  value, to get the contrast that WCAG 2.2 AA requires.
- The translations are machine-made. A native speaker must examine them before
  a store release.
