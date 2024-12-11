import { Transforms, Editor, Element } from "slate"
import { ReactEditor } from "slate-react"
import { LoroMap } from "loro-crdt"
import { ObservableLoroDoc } from "@sinkron/client/lib/collection"
import { fromLoro } from "@sinkron/loro-slate"
import { makeObservable, computed } from "mobx"

import SpaceStore from "~/store/SpaceStore"
import { RootElement, ImageElement } from "~/types"
import { useStateToast } from "~/ui"

import { createSinkronEditor } from "./editor"

const openFileDialog = (cb: (files: FileList) => void) => {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", () => {
        if (input.files !== null) cb(input.files)
    })
    input.click()
}

type DocumentViewStoreProps = {
    id: string
    spaceStore: SpaceStore
    toast: ReturnType<typeof useStateToast>
    doc: ObservableLoroDoc
}

class DocumentViewStore {
    constructor(props: DocumentViewStoreProps) {
        const { id, spaceStore, toast, doc } = props
        this.id = id
        this.spaceStore = spaceStore
        this.toast = toast
        this.doc = doc
        this.editor = createSinkronEditor({
            uploadImage: (file) => this.uploadImage(file)
        })

        makeObservable(this, {
            value: computed
        })
    }

    id: string
    spaceStore: SpaceStore
    toast: ReturnType<typeof useStateToast>
    editor: ReactEditor
    doc: ObservableLoroDoc

    get value() {
        const content = this.doc.doc.getMap("root").get("content")
        if (content instanceof LoroMap) {
            const root = fromLoro(content) as RootElement
            return root.children
        } else {
            return []
        }
    }

    uploadImage(file: File) {
        const { id, state } = this.spaceStore.upload(file)
        state.then(
            () => this.onImageUpload(id, true),
            (error) => this.onImageUpload(id, false, error.message)
        )
        const image = {
            type: "image",
            id,
            status: "uploading",
            children: [{ text: "" }]
        }
        Transforms.insertNodes(this.editor, [image as ImageElement])
    }

    openImageDialog() {
        openFileDialog((files) => {
            const { selection } = this.editor
            if (selection) this.uploadImage(files[0])
        })
    }

    onImageUpload(id: string, success: boolean, error?: string) {
        const nodes = Array.from(
            Editor.nodes(this.editor, {
                match: (n) =>
                    Element.isElementType(n, "image") &&
                    (n as ImageElement).id === id
            })
        )
        for (const [_, at] of nodes) {
            Transforms.setNodes(
                this.editor,
                success ? { status: "ready" } : { status: "error", error },
                { at }
            )
        }
    }

    lock() {
        this.spaceStore.lockDocument(this.id).then(
            () => {
                // do nothing
            },
            (e) => {
                this.toast.error("Couldn't lock document: " + e.message)
            }
        )
    }

    unlock() {
        this.spaceStore.unlockDocument(this.id).then(
            () => {
                // do nothing
            },
            (e) => {
                this.toast.error("Couldn't unlock document: " + e.message)
            }
        )
    }
}

export { DocumentViewStore }
