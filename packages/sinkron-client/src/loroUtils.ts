import { Base64 } from "js-base64"
import { LoroDoc } from "loro-crdt"
import { createAtom, IAtom } from "mobx"

const L = LoroDoc.prototype

class ObservableLoroDoc {
    #doc: LoroDoc
    #atom: IAtom

    constructor(doc: LoroDoc | undefined) {
        this.#doc = doc === undefined ? new LoroDoc() : doc
        this.#atom = createAtom("ObservableLoroDoc")
    }

    get doc() {
        this.#atom.reportObserved()
        return this.#doc
    }

    change(cb: (doc: LoroDoc) => void) {
        cb(this.#doc)
        this.#atom.reportChanged()
    }

    export(...args: Parameters<typeof L.export>): ReturnType<typeof L.export> {
        this.#atom.reportObserved()
        return this.#doc.export(...args)
    }

    fork(...args: Parameters<typeof L.fork>): ObservableLoroDoc {
        this.#atom.reportObserved()
        return new ObservableLoroDoc(this.#doc.fork(...args))
    }

    import(...args: Parameters<typeof L.import>): ReturnType<typeof L.import> {
        const res = this.#doc.import(...args)
        this.#atom.reportChanged()
        return res
    }

    toJSON(...args: Parameters<typeof L.toJSON>): ReturnType<typeof L.toJSON> {
        this.#atom.reportObserved()
        return this.#doc.toJSON(...args)
    }

    version(
        ...args: Parameters<typeof L.version>
    ): ReturnType<typeof L.version> {
        this.#atom.reportObserved()
        return this.#doc.version(...args)
    }
}

const loroToBase64 = (doc: ObservableLoroDoc) => {
    const snapshot = doc.export({ mode: "snapshot" })
    return Base64.fromUint8Array(snapshot)
}

const loroFromBase64 = (data: string) => {
    const doc = new LoroDoc()
    doc.import(Base64.toUint8Array(data))
    return new ObservableLoroDoc(doc)
}

// Apply all missing changes from `fromDoc` to `toDoc`
const mergeChanges = (toDoc: ObservableLoroDoc, fromDoc: ObservableLoroDoc) => {
    const missingChanges = fromDoc.export({
        mode: "update",
        from: toDoc.version(),
    })
    toDoc.import(missingChanges)
}

// Check if `docA` has any changes that are not present in `docB`
const hasChanges = (
    docA: ObservableLoroDoc,
    docB: ObservableLoroDoc,
): boolean => {
    /* - -1: a < b
     * - 0: a == b
     * - 1: a > b
     * - undefined: a ∥ b: a and b are concurrent
     */
    const res = docA.version().compare(docB.version())
    return res === 1 || res === undefined
}

export {
    ObservableLoroDoc,
    loroToBase64,
    loroFromBase64,
    mergeChanges,
    hasChanges,
}
