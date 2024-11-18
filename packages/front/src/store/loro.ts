import { LoroDoc, LoroList } from "loro-crdt"

import { toLoro } from "@sinkron/loro-slate"

const createInitialDocument = () => {
    const doc = new LoroDoc()
    const root = doc.getMap("root")
    root.setContainer(
        "content",
        toLoro({
            children: [
                {
                    type: "title",
                    children: [{ text: "" }]
                }
            ]
        })
    )
    root.setContainer("categories", new LoroList())
    root.set("isPublished", false)
    root.set("isLocked", false)
}

const isMeta = (doc: LoroDoc) => doc.getMap("root").get("isMeta") !== undefined

const isDocument = (doc: LoroDoc) => !isMeta(doc)

export { createInitialDocument, isMeta, isDocument }
