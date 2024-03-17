import { WebSocketServer, WebSocket } from "ws";
import pino from "pino";
import { Document } from "./entities";
import { Sinkron, RequestError } from "./core";
import { ResultType } from "./result";
import { SyncMessage, ChangeMessage, ModifyMessage, CreateMessage } from "./protocol";
import { MessageQueue, WsMessage } from "./messageQueue";
interface SinkronServerOptions {
    sinkron: Sinkron;
    host?: string;
    port?: number;
}
declare class SinkronServer {
    sinkron: Sinkron;
    ws: WebSocketServer;
    clients: Map<WebSocket, {
        subscriptions: Set<string>;
    }>;
    collections: Map<string, {
        subscribers: Set<WebSocket>;
    }>;
    logger: ReturnType<typeof pino>;
    messageQueue: MessageQueue;
    constructor(options: SinkronServerOptions);
    onConnect(ws: WebSocket): Promise<void>;
    handleMessage([ws, msg]: WsMessage): Promise<void>;
    handleSyncMessage(ws: WebSocket, msg: SyncMessage): Promise<void>;
    handleChangeMessage(msg: ChangeMessage, client: WebSocket): Promise<void>;
    handleCreateMessage(msg: CreateMessage): Promise<ResultType<Document, RequestError>>;
    handleModifyMessage(msg: ModifyMessage): Promise<ResultType<Document, RequestError>>;
    onDisconnect(ws: WebSocket): void;
    addSubscriber(col: string, ws: WebSocket): void;
}
export { SinkronServer };
