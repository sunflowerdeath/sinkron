import { WebSocketServer, WebSocket } from "ws";
import pino from "pino";
import { MessageQueue, WsMessage } from "./messageQueue";
interface ChannelServerProps {
    logger?: ReturnType<typeof pino>;
}
declare class ChannelServer {
    logger?: ReturnType<typeof pino>;
    ws: WebSocketServer;
    messageQueue: MessageQueue;
    clients: Map<WebSocket, {
        channels: Set<string>;
    }>;
    channels: Map<string, {
        subscribers: Set<WebSocket>;
    }>;
    dispose: () => void;
    constructor(props: ChannelServerProps);
    onConnect(ws: WebSocket): Promise<void>;
    handleMessage([ws, msg]: WsMessage): void;
    addSubscriber(ws: WebSocket, channame: string): void;
    onDisconnect(ws: WebSocket): void;
    send(channame: string, message: string): void;
}
export { ChannelServer };
