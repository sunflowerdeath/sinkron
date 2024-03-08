import { EntitySchema, DataSource, Repository } from "typeorm"

interface Session {
    key: string
    session: string
}

const SessionEntity = new EntitySchema<Session>({
    name: 'session',
    columns: {
        key: { type: 'text', primary: true },
        session: { type: 'text' },
    },
})

class TypeormKoaSessionStore {
    constructor(db: DataSource) {
        this.repository = db.getRepository(SessionEntity)
    }

    repository: Repository<Session>

    async get(key: string): Promise<object | undefined> {
        const session = await this.repository.findOneBy({ key })
        return session ? JSON.parse(session.session) : undefined
    }

    async set(key: string, session: object) {
        await this.repository.upsert(
            { key, session: JSON.stringify(session) },
            ["key"]
        )
    }

    async destroy(key: string) {
        await this.repository.delete(key)
    }
}

export { SessionEntity, TypeormKoaSessionStore }
