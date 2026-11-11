import { once } from 'node:events'
import { createServer } from 'node:http'

import { mixedXray } from '../fixtures/xrayMixed.ts'

// A real HTTP fixture on an ephemeral loopback port. No upstream requests.
export async function mockSubscriptionServer() {
  let hits = 0
  const server = createServer((request, response) => {
    hits++
    if (request.url !== '/xray.json') {
      response.writeHead(503, { 'Content-Type': 'text/plain' }).end('Fixture unavailable')
      return
    }
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Subscription-Userinfo': 'upload=1; download=2; total=100; expire=2000000000',
      'Profile-Title': 'Local acceptance fixture',
      'Profile-Update-Interval': '24',
      'Support-Url': 'https://support.example.invalid',
      Announce: 'Anonymized local fixture',
    })
    response.end(JSON.stringify(mixedXray))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    url: `${base}/xray.json`,
    hits: () => hits,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}
