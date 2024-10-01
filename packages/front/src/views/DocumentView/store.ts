import { Transforms, Editor, Element } from "slate"
import { ReactEditor } from "slate-react"

import SpaceStore from "../../store/SpaceStore"
import { ImageElement } from "../../types"

import { createSinkronEditor } from "./editor"

const openFileDialog = (cb: (files: FileList) => void) => {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", () => {
        if (input.files !== null) cb(input.files)
    })
    input.click()
}

class DocumentViewStore {
    constructor(spaceStore: SpaceStore) {
        this.spaceStore = spaceStore
        this.editor = createSinkronEditor({
            uploadImage: (file) => this.uploadImage(file)
        })
    }

    spaceStore: SpaceStore
    editor: ReactEditor

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
}

export { DocumentViewStore }
