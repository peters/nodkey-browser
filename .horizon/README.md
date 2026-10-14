# Cloud worker

The development profile has 4 vCPU, 8 GB of memory, Chromium and a desktop.
The image installs the tools for the Linux `validate` job in
`.github/workflows/ci.yml`. It contains no project source or credentials.

On a new checkout, generate the WebAssembly bindings before validation:

```sh
npm ci
npm run wasm
localci run -w ci.yml validate horizon-pins --event push --cache
```

The current workflow runs type checking before `npm test`. Its `pretest`
script generates `src/wasm/nodkey.js` and the type declarations. These files
are ignored by Git, so a new checkout needs `npm run wasm` first. The image
proof uses the preparation above, then runs the existing workflow job.
The existing validation job, tests and source files are unchanged. The only
workflow addition is `horizon-pins`, which checks the worker pins with
`python3 .horizon/verify-pins.py`. Horizon supplies this script beside
`.horizon/pins.json`; keep both files when you commit the setup.

For later checks, use the same job with `--fast`:

```sh
localci run -w ci.yml validate horizon-pins --event push --fast
```

`peters/nodkey-cli` is public, so the validation needs no GitHub
credentials.

The preview loads the built `dist/chromium` extension with Chrome for Testing.
It does not build again. The real relay hostname resolves to loopback for
the preview. Firefox's separate manual browser test is outside this proof.

## Tool sources

| Tool | Version source | Image provision |
| --- | --- | --- |
| Node 24.21.0 and bundled npm | `.nvmrc` | `/opt/node`; checked by `pins.json` |
| Rust 1.99.0, rustup 1.29.1 | Existing worker pins; CI inherits Rust from the runner | `/opt/rust`, `/opt/rustup`; includes `wasm32-unknown-unknown` |
| wasm-bindgen 0.2.129 | `Cargo.lock` | `/opt/wasm-bindgen`; checked by `pins.json` |
| localci 0.1.0 | Latest public release checked during setup | `/usr/local/bin`; archive checked against `SHA256SUMS` |
| Chrome for Testing 155.0.8059.39 | Existing preview pin | `/opt/chrome-linux64`; loads the unpacked extension |
| Compiler, pkg-config, OpenSSL headers, zip | Hosted runner tools used by the scripts | Ubuntu packages in the worker image |
| Git, Bash, sed, Python 3, X11, GL and fonts | Hosted runner tools and preview runtime | Horizon worker base |
| JavaScript packages | `package.json`, `package-lock.json` | `npm ci` during proof |

`Cargo.toml` specifies Rust 1.85 as a minimum, not an exact toolchain pin.
The worker keeps its existing exact Rust version. The SSH session environment
is in `/etc/horizon-worker/session-env.d/20-nodkey-browser.env`.

There are no declared companions. `nodkey-cli` supplies Cargo packages.
The company product map has no Nodkey runtime edge marked `check_together`,
and this repository does not require another repository's test suite.

## Setup changes

- Update the base to the Horizon-supplied Ubuntu 24.04 worker digest.
- Add `pins.json` for Node and wasm-bindgen and the CI pin verification job.
- Include the pin verification job in the documented validation commands.

The existing development profile, image repository, resource sizes, GPU
setting and capabilities are preserved.
