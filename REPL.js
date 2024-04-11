//NODE_EXTRA_CA_CERTS=res/ENGULPH.crt node

const custom = await import('./built/custom-derives/index.js');

const { ApiPromise, WsProvider } = await import("@polkadot/api")
const { BN } = await import("@polkadot/util")

const provider = new WsProvider('wss://arrakis.node.xx.engul.ph/:443')
const options = {
    derives: custom, 
    provider: provider,
    throwOnConnect: true,
}  
const api = await ApiPromise.create(options);
const available_eras = await api.derive.staking.erasHistoric();
const claimer_wallet_addresses = [
    '6ZP6MRGxh9QGDGLrVH5ZZ8csDqYvrizJvEJNikqLmfTH8edo',
    '6ZP6MRGxh9QGDGLrVH5ZZ8csDqYvrizJvEJNikqLmfTH8edo',
    '6ZsRxNgJsmbk57TcC9pihDxZNRXBGe1sXBxWpsmbfUWEbjUD',
    '6WPwdSYHvoSj9Ga6wrByz5byYx93o6nGXDPekXVX84LxkiGL'
]

const blockNumber = 8684185;
const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
const block = await api.rpc.chain.getBlock(blockHash);
const { isSigned, meta, method: { args, method, section } } = block.block.extrinsics[1];


let a = await api.query.system.account(claimer_wallet_addresses[0])


console.log(block.values)
block.block.extrinsics.forEach( (extr) => {
  const method = extr.method;
  if (this.api.tx.staking.validate.is(extr))
  if (method.section === 'staking' && method.method === 'validate'){
    const meta_args = method.meta.args[0]
    if (meta_args.has('type') && meta_args.type.toString() === 'PalletStakingValidatorPrefs') {
      const args = method.args[0];
      if (args.has('commission')){
        console.log(`we have a commission change by ${extr.signer} to ${args.commission}`)
      }
    }
  }
})


async function listenTransfers(api) {
  console.log('Starting finalized blocks listener...');
  return new Promise((reject, resolve) => {
    api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      // Get block number
      const blockNumber = header.number.toNumber();
      // Get block hash
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      // Get block
      const block = await api.rpc.chain.getBlock(blockHash);
      // Get block events
      const blockEvents = await api.query.system.events.at(blockHash);

      blockEvents.forEach( (record) => console.log(record.event))

      // Get transfers
      // const transfers = getTransfers(blockEvents);

      // transfers.forEach((tx) => {
      //   console.log(`Found Transfer in block #${blockNumber}`);
      //   console.log(`FROM: ${tx.from}`);
      //   console.log(`TO: ${tx.to}`);
      //   console.log(`AMOUNT: ${tx.amount}`);
      //   const extrinsicHash = block.block.extrinsics[tx.idx].hash.toHex();
      //   console.log(`View it on the Explorer: explorer.xx.network/extrinsics/${extrinsicHash}`);
      // })
    });
  });
}



// const available_rewards = await api.derive.staking.stakerRewardsMultiEras(claimer_wallet_addresses, available_eras)

// const available_vprefs = await api.derive.staking.erasValidatorPrefs(claimer_wallet_addresses, available_eras)

// const unsub = api.query.system.events((events) => {
//     // Loop through the events
//     events.forEach((record) => {
//       // Extract the event data
//       const { event, phase } = record;
//       const types = event.typeDef;
  
//     console.log(`${JSON.stringify(record)}`)

//       // Check if the event is CommissionChanged
//       if (event.section === 'staking' && event.method === 'CommissionChanged') {
//         // Get the event data
//         const [accountId, commission] = event.data;
  
//         // Log the event details
//         console.log(`CommissionChanged event: ${accountId} changed commission to ${commission}`);
//       }
//     });
//   });

// api.query.system.events((events) => {
//     console.log(`\nReceived ${events.length} events:`);

//     // Loop through the Vec<EventRecord>
//     events.forEach((record) => {
//       // Extract the phase, event and the event types
//       const { event, phase } = record;
//       const types = event.typeDef;

//       // Show what we are busy with
//       console.log(`\t${event.section}:${event.method}:: (phase=${phase.toString()})`);
//       console.log(`\t\t${event.meta.documentation.toString()}`);

//       // Loop through each of the parameters, displaying the type and data
//       event.data.forEach((data, index) => {
//         console.log(`\t\t\t${types[index].type}: ${data.toString()}`);
//       });
//     });
//   });

//   {"phase":{"applyExtrinsic":1},"event":{"index":"0x0408","data":["6ZsRxNgJsmbk57TcC9pihDxZNRXBGe1sXBxWpsmbfUWEbjUD",12200000]},"topics":[]}
// {"phase":{"applyExtrinsic":1},"event":{"index":"0x0407","data":["6XmmXY7zLRirfFQivNnn6LNyRP1aMvtzyr4gATsfbdFh2QqF",9760000]},"topics":[]}
// {"phase":{"applyExtrinsic":1},"event":{"index":"0x1206","data":[9760000]},"topics":[]}
// {"phase":{"applyExtrinsic":1},"event":{"index":"0x0407","data":["6XJH2V7dKdnDVDvGXEwg2TPpwFKMXdPzXSa8Evs3kieGbzUS",2440000]},"topics":[]}
// {"phase":{"applyExtrinsic":1},"event":{"index":"0x0000","data":[{"weight":1144092000,"class":"Normal","paysFee":"Yes"}]},"topics":[]}

function xx_bal_string(xx, sig_digits = 2) {
    formatBalance.setDefaults({ decimals: api.registry.chainDecimals[0], unit: 'xx'})
    const balfor = formatBalance(xx)
    const [num, unit] = balfor.split(' ');
    const [int, frac] = num.split('.');
    const frac_short = frac?.slice(0,sig_digits) ?? ''
    return `${int}${frac_short ? `.${frac_short}` : ''} ${unit}`
  }