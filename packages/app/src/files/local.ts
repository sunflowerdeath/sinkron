import path from "path"
import { readFile, writeFile, unlink } from "fs/promises"
import { mkdirp } from "mkdirp"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import type { ObjectStorage } from "../services/file"

class LocalObjectStorage implements ObjectStorage {
    constructor(dir: string) {
        mkdirp.sync(dir)
        this.dir = dir
    }

    dir: string

    async get(id: string): Promise<ResultType<Buffer, RequestError>> {
        const p = path.join(this.dir, id)
        try {
            const data = await readFile(p)
            return Result.ok(data)
        } catch (error) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Couldn't get file",
                details: { error }
            })
        }
    }

    async put(
        id: string,
        data: Buffer
    ): Promise<ResultType<true, RequestError>> {
        const p = path.join(this.dir, id)
        try {
            await writeFile(p, data)
        } catch (error) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Couldn't save file",
                details: { error }
            })
        }
        return Result.ok(true)
    }

    async delete(id: string): Promise<ResultType<true, RequestError>> {
        const p = path.join(this.dir, id)
        try {
            await unlink(p)
        } catch (error) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Couldn't delete file",
                details: { error }
            })
        }
        return Result.ok(true)
    }
}

export { LocalObjectStorage }
