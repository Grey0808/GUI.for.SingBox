// Manual acceptance helper: node --experimental-strip-types tests/fixtures/serveAcceptance.mjs
import { mockSubscriptionServer } from '../helpers/mockSubscriptionServer.mjs'
const fixture = await mockSubscriptionServer()
process.stdout.write(
  `Anonymized fixture: ${fixture.url}\nHTTP failure fixture: ${fixture.base}/error\nUse direct/no-proxy requests. No VPN core is started. Ctrl+C closes this server.\n`,
)
