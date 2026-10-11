# ADR-0001: Make a standalone extension that uses nodkey-proto as WebAssembly

Status: Accepted.
Date: 2026-10-11.

## Context

The Nodkey app on the iPhone keeps the logins and the one-time codes. An agent
asks the phone for one login or one code through the relay. The person approves
each request with Face ID. The `nodkey` command line and its MCP server are an
agent. A browser extension is a different agent with the same protocol.

An extension can send its requests to the `nodkey` program on the computer
(native messaging). An extension can also do all of the protocol work itself.
The first solution needs a second installation. A browser store cannot supply
that installation.

The protocol code is in the `nodkey-proto` crate in `peters/nodkey-cli`. A copy
of that code can become different from the original over time.

## Decision

The extension is standalone. It does not need the `nodkey` program.

The extension uses `nodkey-proto` from `peters/nodkey-cli` as a Cargo git
dependency at a fixed revision. The `wasm/` crate compiles it to WebAssembly.
The crate exports only thin functions: seal a request, seal a password, seal a
picture, open an answer, open a pairing grant, sign and the check number. All
of the protocol logic stays in `nodkey-proto` (`client.rs`). The command line
uses the same functions.

To use a protocol change, change the revision in `Cargo.toml` and run the tests.

## Consequences

- The extension and the command line use the same protocol code. The test
  vectors in `peters/nodkey-cli` check both.
- The build needs Rust, the `wasm32-unknown-unknown` target and
  `wasm-bindgen-cli` with the same version as `Cargo.lock`.
- The build needs read access to `peters/nodkey-cli` while that repository is
  private. CI needs a token for that repository.
- The WebAssembly file is approximately 300 KB.
