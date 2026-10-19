// A pass-through in front of the fake relay for the pairing by hand in Firefox: the driver cannot
// read the extension's agent id there, so this reads it from `POST /v1/pairings` and prints the
// check number of the fake phone (`fake_check`) to compare with the number on the screen.
import { createServer } from 'node:http'

/**
 * @param {string} relayBase the fake relay, `http://127.0.0.1:<port>`
 * @param {(msg: string) => void} print
 * @returns {Promise<{ base: string, stop(): void }>}
 */
export async function startRelayProxy(relayBase, print) {
  const server = createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (req.method === 'POST' && req.url === '/v1/pairings') {
        void watchCheck(relayBase, JSON.parse(body.toString()).agent_id, print)
      }
      /** @type {Record<string, string>} */
      const headers = {}
      for (const name of ['nodkey-auth', 'content-type']) {
        const v = req.headers[name]
        if (typeof v === 'string') headers[name] = v
      }
      fetch(relayBase + (req.url ?? '/'), {
        method: req.method,
        headers,
        body: body.length > 0 ? body : undefined,
        redirect: 'manual',
      }).then(
        async (r) => {
          res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'text/plain' })
          res.end(Buffer.from(await r.arrayBuffer()))
        },
        () => {
          res.writeHead(502)
          res.end()
        },
      )
    })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(undefined)))
  // It never keeps the run alive by itself.
  server.unref()
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { base: `http://127.0.0.1:${port}`, stop: () => server.close() }
}

/** Prints the fake phone's check number for `agentId` once the pairing check came. */
async function watchCheck(relayBase, agentId, print) {
  const end = Date.now() + 10 * 60_000
  while (Date.now() < end) {
    const r = await fetch(`${relayBase}/_fake/check/${agentId}`)
    if (r.ok) {
      const { check } = await r.json()
      if (check) {
        print(JSON.stringify({ fake_check: check, agent_id: agentId }))
        return
      }
    }
    await new Promise((ok) => setTimeout(ok, 500))
  }
}
