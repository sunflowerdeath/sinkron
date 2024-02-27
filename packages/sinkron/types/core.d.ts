import { DataSource, Repository, EntityManager } from 'typeorm';
import * as Automerge from '@automerge/automerge';
import type { Document, Collection, Group, GroupMember } from './entities';
import { ResultType } from './result';
import { ErrorCode } from './protocol';
type ChangedDocuments = {
    col: string;
    colrev: number;
    documents: Document[];
};
export type RequestError = {
    code: ErrorCode;
    details?: string;
};
interface SinkronProps {
    dbPath: string;
}
declare class Sinkron {
    constructor(props: SinkronProps);
    db: DataSource;
    models: {
        documents: Repository<Document>;
        collections: Repository<Collection>;
        groups: Repository<Group>;
        members: Repository<GroupMember>;
    };
    init(): Promise<void>;
    getModels(m: EntityManager): {
        documents: Repository<import("typeorm").ObjectLiteral>;
        collections: Repository<import("typeorm").ObjectLiteral>;
        groups: Repository<import("typeorm").ObjectLiteral>;
        members: Repository<import("typeorm").ObjectLiteral>;
    };
    getDocumentTr(m: EntityManager, id: string): Promise<Document | null>;
    getColEntityTr(m: EntityManager, col: string): Promise<Collection | null>;
    createCollectionTr(m: EntityManager, id: string): Promise<ResultType<Collection, RequestError>>;
    syncCollectionTr(m: EntityManager, col: string, colrev?: number): Promise<ResultType<ChangedDocuments, RequestError>>;
    createDocumentTr(m: EntityManager, id: string, col: string, data: Uint8Array): Promise<ResultType<Document, RequestError>>;
    incrementColrevTr(m: EntityManager, id: string): Promise<ResultType<number, RequestError>>;
    updateDocumentEntityTr(m: EntityManager, doc: Document, update: Partial<Document>): Promise<ResultType<Document, RequestError>>;
    updateDocumentTr(m: EntityManager, id: string, data: Uint8Array[] | null): Promise<ResultType<Document, RequestError>>;
    updateDocumentWithCallbackTr<T>(m: EntityManager, id: string, cb: Automerge.ChangeFn<T>): Promise<ResultType<Document, RequestError>>;
    createCollection(id: string): Promise<ResultType<Collection, RequestError>>;
    getCollection(id: string): Promise<Collection | null>;
    deleteCollection(id: string): Promise<ResultType<true, RequestError>>;
    getDocument(id: string): Promise<Document | null>;
    syncCollection(col: string, colrev?: number): Promise<ResultType<ChangedDocuments, RequestError>>;
    createDocument(id: string, col: string, data: Uint8Array): Promise<ResultType<Document, RequestError>>;
    updateDocument(id: string, data: Uint8Array[] | null): Promise<ResultType<Document, RequestError>>;
    updateDocumentWithCallback<T>(id: string, cb: Automerge.ChangeFn<T>): Promise<ResultType<Document, RequestError>>;
    deleteDocument(id: string): Promise<ResultType<Document, RequestError>>;
    createGroup(id: string): Promise<ResultType<Group, RequestError>>;
    deleteGroup(id: string): Promise<ResultType<true, RequestError>>;
    addMemberToGroup(user: string, group: string): Promise<ResultType<true, RequestError>>;
    removeMemberFromGroup(user: string, group: string): Promise<ResultType<true, RequestError>>;
}
export { Sinkron };
