import amqplib from "amqplib"
import TonstorageCLI from "./cli.js";
import {ContractState} from "./types.js";

const TORRENTS_QUEUE = "torrents-steams"


const tonstorage = new TonstorageCLI({
  bin: process.env.TONSTORAGE_BIN || "/usr/local/bin/storage-daemon-cli",
  host: process.env.TONSTORAGE_HOST || "127.0.0.1:5555",
  privateKey: process.env.TONSTORAGE_PRIVATE_KEY || "",
  publicKey: process.env.TONSTORAGE_PUBLIC_KEY || "",
  timeout: process.env.TONSTORAGE_TIMEOUT ? parseInt(process.env.TONSTORAGE_TIMEOUT) : 5000
});


// {"event_name": "CreateContract", "payload":{"address": "EQDPQcYytoMmCIHdA6UiaQEeNhmYX-4BcioUflqqyoIdB-7j"}}
//
// {"payload":{"address": "EQAMsjpvqElJzDwJ-Z6F6EznwEVP9QYRgeJHmlmuHlK9_Aly"}}

interface Event<Payload> {
  payload: Payload
}

try {
  const torrentsResponse = await tonstorage.list();

  if(!torrentsResponse.ok || !torrentsResponse.result) {
    process.exit(1)
  }

  if(torrentsResponse.result.torrents.length === 0) {
    process.exit(0)
  }

  const providerInfoResponse = await tonstorage.getProviderInfo({
    contracts: true,
    balances: false
  })

  if(!providerInfoResponse.ok || !providerInfoResponse.result) {
    process.exit(1)
  }

  const { torrents } = torrentsResponse.result;
  const { contracts } = providerInfoResponse.result

  const connection = await amqplib.connect(process.env.RABBIT_MQ_URL || "amqp://localhost:5672")
  connection.on("close", () => {
    console.log("Connection closed")
  })

  const channel = await connection.createChannel()
  await channel.assertQueue(TORRENTS_QUEUE)

  channel.on("close", () => {
    console.log("close channel")
  })

  torrents.forEach((torrent) => {
    const contract = contracts.find(item => item.torrent === torrent.hash)
    if(!contract && torrent.completed) {
      channel.sendToQueue(TORRENTS_QUEUE, Buffer.from(JSON.stringify({
        event_name: "RemoveTorrent",
        payload: {
          torrent,
        },
      })), {
        persistent: true
      })
    }
    if(contract && contract.state !== ContractState.Active) {
      channel.sendToQueue(TORRENTS_QUEUE, Buffer.from(JSON.stringify({
        event_name: "RemoveTorrent",
        payload: {
          torrent,
          contract
        },
      })), {
        persistent: true
      })
    }
  })

  await channel.close()
  await connection.close()
} catch (e) {
  console.error(e)
}
