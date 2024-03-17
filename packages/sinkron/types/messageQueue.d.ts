/// <reference types="node" />
import { WebSocket } from "ws";
export type WsMessage = [WebSocket, Buffer];
export type MessageQueueCallback<T> = (msg: T) => Promise<void>;
declare class MessageQueue<T = WsMessage> {
    constructor(callback: MessageQueueCallback<T>);
    messages: T[];
    callback: (msg: T) => Promise<void>;
    isRunning: boolean;
    push(msg: T): void;
    processMessage(): Promise<void>;
}
export { MessageQueue };
