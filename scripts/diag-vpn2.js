const vpn = require('../vpn-manager')
const url = process.argv[2]
vpn.fetchSubscription(url)
  .then(items => {
    console.log('PARSED OK, items:', items.length)
    if (items[0]) console.log('first:', items[0].parsed.name, '| outbound.type:', items[0].parsed.outbound?.type)
  })
  .catch(e => { console.log('THROWN:', e.constructor.name, '::', e.message) })
