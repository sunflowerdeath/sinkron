import { createRoot } from "react-dom/client"
import { useState, useMemo, useCallback } from "react"
import { createEditor } from "slate"
import {
    withReact,
    Slate,
    Editable,
    RenderElementProps,
    RenderLeafProps
} from "slate-react"

import type { SinkronElement } from "./types"
import env from "./env"
import { Api } from "./api"
import { EditorLeaf, PostElement } from "./views/DocumentView/elements"

const api = new Api({
    baseUrl: env.apiUrl,
    getToken: () => undefined
})

type PostContent = { children: SinkronElement[] }

type PostProps = {
    content: PostContent
}

const Post = (props: PostProps) => {
    const editor = useMemo(() => {
        const editor = withReact(createEditor())
        editor.isInline = (elem) => elem.type === "link"
        editor.isVoid = (elem) => elem.type === "image"
        return editor
    }, [])
    // TODO title

    const renderElement = useCallback(
        (props: RenderElementProps) => <PostElement {...props} />,
        []
    )
    const renderLeaf = useCallback(
        (props: RenderLeafProps) => <EditorLeaf {...props} />,
        []
    )

    return (
        <Slate editor={editor} initialValue={props.content.children}>
            <Editable
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                readOnly
            />
        </Slate>
    )
}

type FetchState<T> =
    | { state: "pending" }
    | { state: "error"; error: Error }
    | { state: "success"; value: T }

const Root = () => {
    const id = window.location.pathname
        .replace(/^\/posts\//, "")
        .replace(/\/$/, "")
    const [fetchState, setFetchState] = useState<FetchState<PostContent>>({
        state: "pending"
    })
    useMemo(() => {
        api.fetch({ url: `/posts/${id}/content` }).then(
            (value) => setFetchState({ state: "success", value }),
            (error) => setFetchState({ state: "error", error })
        )
    }, [])

    let content
    if (fetchState.state === "pending") {
        content = <div style={{ color: "var(--color-secondary)" }}>Loading</div>
    } else if (fetchState.state === "error") {
        content = (
            <div style={{ color: "var(--color-error)" }} className="fadeIn">
                <div style={{ marginBottom: "1rem" }}>Error!</div>
                {fetchState.error.message}
            </div>
        )
    } /* if (fetchState.state === "success") */ else {
        content = (
            <div className="fadeIn">
                <Post content={fetchState.value} />
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 800, margin: "auto", padding: "2rem 1rem" }}>
            {content}
        </div>
    )
}

const root = createRoot(document.getElementById("root")!)
root.render(<Root />)
