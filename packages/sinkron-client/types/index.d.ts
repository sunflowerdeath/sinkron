import * as Automerge from "@automerge/automerge";
import type { ChangeFn } from "@automerge/automerge";
import { createNanoEvents } from "nanoevents";
import { Logger } from "pino";
import { debounce } from "lodash-es";
import type { SyncErrorMessage, SyncCompleteMessage, DocMessage, CreateMessage, ChangeMessage, ModifyMessage } from "sinkron/types/protocol.d.ts";
interface Transport {
    open(): void;
    close(): void;
    send(msg: string): void;
    emitter: ReturnType<typeof createNanoEvents>;
}
type WebSocketTransportProps = {
    url: string;
    webSocketImpl?: typeof WebSocket;
};
declare class WebSocketTransport implements Transport {
    constructor(props: WebSocketTransportProps);
    emitter: import("nanoevents").Emitter<import("nanoevents").DefaultEvents>;
    url: string;
    webSocketImpl: typeof WebSocket;
    ws?: WebSocket;
    open(): void;
    close(): void;
    send(msg: string): void;
}
type StoredItem<T> = {
    id: string;
    remote: Automerge.Doc<T> | null;
    local: Automerge.Doc<T> | null;
    createdAt?: Date;
    updatedAt?: Date;
    localUpdatedAt?: Date;
};
export interface CollectionStore<T> {
    save(id: string, item: Item<T>, colrev: number): Promise<void>;
    delete(id: string, colrev: number): Promise<void>;
    load(): Promise<{
        items: StoredItem<T>[];
        colrev: number;
    }>;
    dispose(): void;
}
interface SerializedItem {
    id: string;
    local: string | null;
    remote: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    localUpdatedAt?: Date;
}
declare class IndexedDbCollectionStore<T> implements CollectionStore<T> {
    constructor(key: string);
    key: string;
    isReady: Promise<void>;
    db?: IDBDatabase;
    dispose(): void;
    clear(): Promise<void>;
    save(id: string, item: Item<T>, colrev: number): Promise<void>;
    delete(id: string, colrev: number): Promise<void>;
    deserializeItem(item: SerializedItem): StoredItem<T>;
    load(): Promise<{
        colrev: number;
        items: StoredItem<T>[];
    }>;
    static clearAll(): Promise<void>;
}
export declare enum ItemState {
    Changed = 1,
    ChangesSent = 2,
    Synchronized = 3
}
export interface Item<T> {
    id: string;
    remote: Automerge.Doc<T> | null;
    local: Automerge.Doc<T> | null;
    state: ItemState;
    localUpdatedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    sentChanges: Set<string>;
}
export declare enum ConnectionStatus {
    Disconnected = "disconnected",
    Connected = "connected",
    Sync = "sync",
    Ready = "ready",
    Error = "error"
}
interface CollectionProps<T> {
    col: string;
    transport: Transport;
    store?: CollectionStore<T>;
    errorHandler?: (msg: SyncErrorMessage) => void;
    logger?: Logger<string>;
}
declare class Collection<T extends object> {
    constructor(props: CollectionProps<T>);
    col: string;
    transport: Transport;
    store?: CollectionStore<T>;
    logger: Logger<string>;
    errorHandler?: (msg: SyncErrorMessage) => void;
    colrev: number;
    items: Map<string, Item<T>>;
    isLoaded: boolean;
    status: ConnectionStatus;
    initialSyncCompleted: boolean;
    isDestroyed: boolean;
    flushDebounced: ReturnType<typeof debounce>;
    stopAutoReconnect?: () => void;
    backupQueue: Set<string>;
    flushQueue: Set<string>;
    destroy(): void;
    init(): Promise<void>;
    loadFromStore(): Promise<void>;
    startSync(): void;
    onMessage(msg: string): void;
    onSyncComplete(msg: SyncCompleteMessage): void;
    handleSyncError(msg: SyncErrorMessage): void;
    handleChangeMessage(msg: ChangeMessage): void;
    handleDocMessage(msg: DocMessage | CreateMessage): void;
    handleModifyMessage(msg: ModifyMessage): void;
    backup(): Promise<void>;
    flush(): void;
    onChangeItem(id: string, flushImmediate: boolean): void;
    create(initialData: T): string;
    change(id: string, callback: ChangeFn<T>): void;
    delete(id: string): void;
}
export interface ChannelClientProps {
    url: string;
    channel: string;
    handler: (msg: string) => void;
}
declare class ChannelClient {
    transport: Transport;
    dispose: () => void;
    constructor(props: ChannelClientProps);
}
export { Collection, WebSocketTransport, IndexedDbCollectionStore, ChannelClient };
