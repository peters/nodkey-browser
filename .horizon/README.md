# Cloud worker

The development profile has 4 vCPU, 8 GB of memory, Chromium and a desktop.
The image installs the tools for the Linux `validate` job in
`.github/workflows/ci.yml`. It contains no project source or credentials.

On a new checkout, generate the WebAssembly bindings before validation:

```sh
npm ci
npm run wasm
localci run -w ci.yml validate --event push --skip 'Read access to peters/nodkey-cli (private)' --cache
```

The current workflow runs type checking before `npm test`. Its `pretest`
script generates `src/wasm/nodkey.js` and the type declarations. These files
are ignored by Git, so a new checkout needs `npm run wasm` first. The image
proof uses the preparation above, then runs the existing workflow job.
No workflow, test or source file is changed.

For later checks, use the same job with `--fast`:

```sh
localci run -w ci.yml validate --event push --skip 'Read access to peters/nodkey-cli (private)' --fast
```

The skipped step writes a CI secret into Git configuration. Use Horizon's
machine-local GitHub access binding for `peters/nodkey-cli` instead. Never
copy the CI token into the image or this configuration.

The preview loads the built `dist/chromium` extension with Chrome for Testing.
It does not build again. The real relay hostname resolves to loopback for
the preview. Firefox's separate manual browser test is outside this proof.
