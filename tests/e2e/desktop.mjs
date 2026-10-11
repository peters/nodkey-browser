// An isolated X11 desktop for the browser tests: Xvfb on a free display, Openbox, and a
// view-only x11vnc on loopback for a Horizon VNC Device panel. Nothing touches the developer's
// own desktop.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @param {string} state private folder for logs
 * @param {{ vnc?: string, vncLib?: string, width?: number, height?: number }} options
 */
export async function startDesktop(state, options = {}) {
  mkdirSync(state, { recursive: true })
  /** @type {import('node:child_process').ChildProcess[]} */
  const children = []
  /** @param {string} name */
  const log = (name) => openSync(join(state, `${name}.log`), 'a')
  const width = options.width ?? 1600
  const height = options.height ?? 1000

  // Xvfb picks a free display and writes its number to the pipe on fd 3.
  const xvfb = spawn(
    'Xvfb',
    [
      '-displayfd',
      '3',
      '-screen',
      '0',
      `${width}x${height}x24`,
      '-nolisten',
      'tcp',
      '-extension',
      'MIT-SHM',
    ],
    { stdio: ['ignore', log('xvfb'), log('xvfb'), 'pipe'] },
  )
  children.push(xvfb)
  const display = await new Promise((resolve, reject) => {
    let out = ''
    const pipe = /** @type {import('node:stream').Readable} */ (xvfb.stdio[3])
    pipe.on('data', (b) => {
      out += String(b)
      if (out.includes('\n')) resolve(`:${out.trim()}`)
    })
    xvfb.on('exit', (code) => reject(new Error(`Xvfb exited (${code})`)))
  })
  // An X11-only environment: browsers and x11vnc must not pick the developer's Wayland session.
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, DISPLAY: String(display), XDG_SESSION_TYPE: 'x11' }
  delete env.WAYLAND_DISPLAY
  children.push(spawn('openbox', [], { env, stdio: ['ignore', log('openbox'), log('openbox')] }))

  const vncBin = options.vnc ?? 'x11vnc'
  const vncEnv = options.vncLib ? { ...env, LD_LIBRARY_PATH: options.vncLib } : env
  const vnc = spawn(
    vncBin,
    [
      '-norc',
      '-no6',
      '-display',
      display,
      '-localhost',
      '-autoport',
      '41000',
      '-viewonly',
      '-forever',
      '-shared',
      '-nopw',
      '-noxdamage',
      '-noshm',
    ],
    { env: vncEnv, stdio: ['ignore', 'pipe', log('x11vnc')] },
  )
  children.push(vnc)
  const port = await new Promise((resolve, reject) => {
    vnc.on('exit', () => {
      for (const c of children) c.kill()
    })
    let out = ''
    vnc.stdout?.on('data', (b) => {
      out += String(b)
      const m = /^PORT=(\d+)$/m.exec(out)
      if (m) resolve(Number(m[1]))
    })
    vnc.on('exit', (code) => reject(new Error(`x11vnc exited (${code})`)))
  })
  return {
    display,
    vncAddress: `127.0.0.1:${port}`,
    env,
    stop() {
      for (const c of children.reverse()) c.kill()
    },
  }
}

/** The unpacked x11vnc from a Horizon tools root, if present. */
export function findVnc() {
  const roots = [process.env.NODKEY_E2E_TOOLS].filter(Boolean)
  for (const root of roots) {
    const bin = join(root, 'usr/bin/x11vnc')
    if (existsSync(bin)) return { vnc: bin, vncLib: join(root, 'usr/lib/x86_64-linux-gnu') }
  }
  return {}
}
