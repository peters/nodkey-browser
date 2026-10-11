// Builds the WebAssembly module (nodkey-proto from nodkey-cli) and its JavaScript bindings into
// src/wasm. Needs Rust with the wasm32-unknown-unknown target and wasm-bindgen-cli matching the
// wasm-bindgen version in Cargo.lock.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const lock = readFileSync('Cargo.lock', 'utf8')
const want = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1]
const have = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim().split(' ')[1]
if (want !== have) {
  throw new Error(
    `wasm-bindgen ${have} does not match ${want} in Cargo.lock: cargo install wasm-bindgen-cli --version ${want} --locked`,
  )
}
/** @param {string} cmd @param {string[]} args */
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })
run('cargo', [
  'build',
  '--locked',
  '--release',
  '-p',
  'nodkey-wasm',
  '--target',
  'wasm32-unknown-unknown',
])
run('wasm-bindgen', [
  '--target',
  'web',
  '--out-dir',
  'src/wasm',
  '--out-name',
  'nodkey',
  'target/wasm32-unknown-unknown/release/nodkey_wasm.wasm',
])
