import { getHttpEndpoint } from "@orbs-network/ton-access"
import {TonClient, address, Address} from "ton"
import amqplib from "amqplib"

const FILES_QUEUE = "files-steams"
const CONTRACTS_QUEUE = "contract-queue"

const endpoint = await getHttpEndpoint({
  network: "testnet"
})

const client = new TonClient({ endpoint })

// {"event_name": "CreateContract", "payload":{"address": "EQDPQcYytoMmCIHdA6UiaQEeNhmYX-4BcioUflqqyoIdB-7j"}}
//
// {"payload":{"address": "EQAMsjpvqElJzDwJ-Z6F6EznwEVP9QYRgeJHmlmuHlK9_Aly"}}
const checkStatusContract = async (contractAddress: Address): Promise<boolean | undefined> => {
  try {
    const res = await client.callGetMethodWithError(contractAddress, "is_active")
    if(res.exit_code !== 0) {
      return false
    }

    return res.stack.readBoolean()
  } catch (e) {
    console.error(e)
  }
}

interface Event<Payload> {
  payload: Payload
}

let processedCountMessages = 0

try {
    const connection = await amqplib.connect(process.env.RABBIT_MQ_URL || "amqp://localhost:5672")
  connection.on("close", () => {
    console.log("Connection closed")
  })

  const channel = await connection.createChannel()
  channel.on("close", () => {
    console.log("close channel")
  })

  const { messageCount: contractCount } =  await channel.assertQueue(CONTRACTS_QUEUE)
  console.log("contractCount: ", contractCount)
  if(contractCount === 0) {
    await channel.close()
    await connection.close()
    process.exit(0)
  }

  await channel.consume(CONTRACTS_QUEUE, async (msg) => {
    try {
      if(msg) {
        const event = JSON.parse(msg.content.toString("utf8")) as Event<{address: string}>
        console.log("process event", event)
        const isActive = await checkStatusContract(address(event.payload.address))
        if(!isActive) {
          channel.ack(msg)
          await channel.assertQueue(FILES_QUEUE)
          channel.sendToQueue(FILES_QUEUE, Buffer.from(JSON.stringify({
            event_name: "CloseContract",
            payload: {
              address: event.payload.address
            },
          })), {
            persistent: true
          })
        }
        processedCountMessages += 1
        if(processedCountMessages === contractCount) {
          await channel.close()
          await connection.close()
        }
      }
    } catch (e) {
      console.error(e)
    }
  })

} catch (e) {
  console.error(e)
}
