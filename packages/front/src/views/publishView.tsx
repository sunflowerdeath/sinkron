import { useMemo } from "react"
import { makeAutoObservable, action } from "mobx"
import { observer } from "mobx-react-lite"
import { fromPromise } from "mobx-utils"
import { Col } from "oriente"
import { parseISO, format } from "date-fns"

import env from "~/env"
import { useSpace } from "~/store"
import { Post } from "~/entities"
import { Api } from "~/api"
import {
    Button,
    Container,
    ButtonsGrid,
    ActionStateView,
    ActionState,
    makeInitialActionState
} from "~/ui"

type PublishStoreProps = {
    api: Api
    docId: string
    spaceId: string
}

class PublishStore {
    constructor(props: PublishStoreProps) {
        this.api = props.api
        this.docId = props.docId
        this.spaceId = props.spaceId
        makeAutoObservable(this, { api: false })
        this.fetch()
    }

    api: Api
    docId: string
    spaceId: string
    post: Post | null = null

    fetchState: ActionState<any> = makeInitialActionState()
    actionState: ActionState<any> = makeInitialActionState()

    fetch() {
        this.fetchState = fromPromise(
            this.api.fetch<Post>({ url: `/posts/${this.docId}` }).catch((e) => {
                if (e.kind === "application" && e.data.code === "not_found") {
                    return null
                }
                throw e
            })
        )
        this.fetchState.then((post) => {
            this.post = post
        })
    }

    publish() {
        const state = fromPromise(
            this.api.fetch<Post>({
                url: `/posts/new`,
                method: "POST",
                data: { docId: this.docId, spaceId: this.spaceId }
            })
        )
        state.then(
            action((post) => {
                this.post = post
            })
        )
        this.actionState = state
    }

    update() {
        const state = fromPromise(
            this.api.fetch<Post>({
                url: `/posts/${this.docId}/update`,
                method: "POST"
            })
        )
        state.then(
            action((post) => {
                this.post = post
            })
        )
        this.actionState = state
    }

    unpublish() {
        const state = fromPromise(
            this.api.fetch({
                url: `/posts/${this.docId}/unpublish`,
                method: "POST"
            })
        )
        state.then(
            action(() => {
                this.post = null
            })
        )
        this.actionState = state
    }
}

type PublishFormProps = {
    store: PublishStore
}

const PublishForm = observer((props: PublishFormProps) => {
    const { store } = props

    if (store.post === null) {
        return (
            <Col gap={16}>
                Document is not published
                <Button
                    style={{ alignSelf: "stretch" }}
                    onClick={() => store.publish()}
                >
                    Publish
                </Button>
            </Col>
        )
    } else {
        const date = format(
            parseISO(store.post.publishedAt),
            "'on' d MMM 'at' H:mm"
        )
        const host = env.isProductionEnv
            ? "https://sinkron.xyz"
            : "http://localhost:1337"
        const url = `${host}/posts/${store.post.id}/`
        return (
            <Col gap={16}>
                <div>Document is published {date}</div>
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--color-link)" }}
                >
                    {url}
                </a>
                <ButtonsGrid>
                    <Button
                        onClick={() => {
                            navigator.clipboard?.writeText(url)
                        }}
                        style={{ gridColumn: "span 2" }}
                    >
                        Copy link
                    </Button>
                    <Button
                        style={{
                            textAlign: "center",
                            fontSize: ".9rem",
                            lineHeight: "1.5em"
                        }}
                        onClick={() => store.update()}
                    >
                        Update to current version
                    </Button>
                    <Button onClick={() => store.unpublish()}>Unpublish</Button>
                </ButtonsGrid>
            </Col>
        )
    }
})

type PublishViewProps = {
    docId: string
    onClose: () => void
}

const PublishView = observer((props: PublishViewProps) => {
    const { onClose, docId } = props

    const spaceStore = useSpace()
    const store = useMemo(
        () =>
            new PublishStore({
                api: spaceStore.api,
                spaceId: spaceStore.space.id,
                docId
            }),
        []
    )

    return (
        <Container title="Publish document" onClose={onClose}>
            <ActionStateView state={store.fetchState}>
                {() => <PublishForm store={store} />}
            </ActionStateView>
        </Container>
    )
})

export { PublishView }
