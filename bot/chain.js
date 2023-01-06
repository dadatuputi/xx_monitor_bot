const { ApiPromise, WsProvider } = require('@polkadot/api');
const wsProvider = new WsProvider('wss://192.168.0.179:443');
const api = await ApiPromise.create({ provider: wsProvider });

async function main () {
  const wsProvider = new WsProvider('wss://192.168.0.180:63007');
  const api = await ApiPromise.create({ provider: wsProvider });

  let count = 0;

  const unsubscribe = await api.rpc.chain.subscribeNewHeads((header) => {
    console.log(`Chain is at block: #${header.number}`);

    if (++count === 256) {
      unsubscribe();
      process.exit(0);
    }
  });
}

main().catch(console.error);