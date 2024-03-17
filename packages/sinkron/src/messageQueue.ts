import { WebSocket } from "ws"

export type WsMessage = [WebSocket, Buffer]

export type MessageQueueCallback<T> = (msg: T) => Promise<void>

class MessageQueue<T = WsMessage> {
    constructor(callback: MessageQueueCallback<T>) {
        this.callback = callback
    }

    messages: T[] = []
    callback: (msg: T) => Promise<void>
    isRunning = false

    push(msg: T) {
        this.messages.push(msg)
        if (this.isRunning) return
        this.isRunning = true
        this.processMessage()
    }

    async processMessage() {
        const msg = this.messages.shift()
        if (msg === undefined) {
            this.isRunning = false
            return
        }
        await this.callback(msg)
        this.processMessage()
    }
}

export { MessageQueue }
