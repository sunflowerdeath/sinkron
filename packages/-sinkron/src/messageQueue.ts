import { WebSocket } from "ws"

export type WsMessage = [WebSocket, Buffer]

export type MessageQueueCallback<T> = (msg: T) => Promise<void>

export interface MessageQueue<T> {
    push(msg: T): void
}

class AsyncMessageQueue<T = WsMessage> implements MessageQueue<T> {
    constructor(callback: MessageQueueCallback<T>) {
        this.callback = callback
    }

    callback: (msg: T) => Promise<void>

    push(msg: T) {
        this.callback(msg)
    }
}

class SequentialMessageQueue<T = WsMessage> implements MessageQueue<T> {
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

export { AsyncMessageQueue, SequentialMessageQueue }
