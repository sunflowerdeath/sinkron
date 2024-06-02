/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { Logger } from "pino";
import { Document } from "./entities";
import { Sinkron, RequestError } from "./core";
import { ResultType } from "./result";
import { SyncMessage, ChangeMessage, ModifyMessage, CreateMessage, DeleteMessage } from "./protocol";
import { MessageQueue, WsMessage } from "./messageQueue";
interface SinkronServerOptions {
    sinkron: Sinkron;
    logger?: Logger<string>;
    host?: string;
    port?: number;
}
type ProfilerSegment = {
    start: number;
    handledMessages: number;
    handlerDuration: number;
    sentMessages: number;
};
declare class SinkronServer {
    sinkron: Sinkron;
    ws: WebSocketServer;
    clients: Map<WebSocket, {
        subscriptions: Set<string>;
        id: string;
    }>;
    collections: Map<string, {
        subscribers: Set<WebSocket>;
    }>;
    logger: Logger<string>;
    messageQueue: MessageQueue;
    profile?: ProfilerSegment;
    constructor(options: SinkronServerOptions);
    upgrade(request: IncomingMessage, socket: Duplex, head: Buffer, client: object): void;
    onConnect(ws: WebSocket, request: IncomingMessage, client: {
        id: string;
    }): Promise<void>;
    handleMessage([ws, msg]: WsMessage): Promise<void>;
    handleSyncMessage(ws: WebSocket, msg: SyncMessage): Promise<void>;
    handleChangeMessage(msg: ChangeMessage, ws: WebSocket): Promise<void>;
    handleCreateMessage(msg: CreateMessage, ws: WebSocket): Promise<ResultType<Document, RequestError>>;
    handleDeleteMessage(msg: DeleteMessage, ws: WebSocket): Promise<ResultType<Document, RequestError>>;
    handleModifyMessage(msg: ModifyMessage, ws: WebSocket): Promise<ResultType<Document, RequestError>>;
    onDisconnect(ws: WebSocket): void;
    addSubscriber(col: string, ws: WebSocket): void;
    report(): {};
}
export { SinkronServer };
