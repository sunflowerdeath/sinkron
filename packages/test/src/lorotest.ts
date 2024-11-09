import { LoroDoc } from "loro-crdt"

// Clone document to new independent instance
const cloneLoro = (doc: LoroDoc) : LoroDoc => {
    const snapshot = doc.export({ mode: "snapshot" })
    const clone = new LoroDoc()
    clone.import(snapshot)
    return clone
}

// Apply all missing changes from `fromDoc` to `toDoc`
const mergeChanges = (toDoc: LoroDoc, fromDoc: LoroDoc) => {
    const missingChanges = fromDoc.export({
        mode: "update",
        from: toDoc.version()
    })
    toDoc.import(missingChanges)
}

// Check if `docA` has any changes that are not present in `docB`
const hasChanges = (docA: LoroDoc, docB: LoroDoc) : boolean => {
    /* - -1: a < b
    * - 0: a == b
    * - 1: a > b
    * - undefined: a ∥ b: a and b are concurrent
    */
    let res = docA.version().compare(docB.version())
    return res === 1 || res === undefined
}

// check if local document has changes
let local = new LoroDoc()
local.getText("text").insert(0, "Hello")

let remote = local.fork()

console.log(local.version().compare(local.version()))

// no changes
const changes = local.export({ mode: "update", from: remote.version() })
console.log(changes)
console.log(hasChanges(local, remote))

// remote changed
remote.getText("text").insert(5, ", remote!")
const changes3 = local.export({ mode: "update", from: remote.version() })
console.log(changes3)
console.log(hasChanges(local, remote))

// local changed
local.getText("text").insert(5, ", world!")
const changes2 = local.export({ mode: "update", from: remote.version() })
console.log(changes2)
console.log(hasChanges(local, remote))


