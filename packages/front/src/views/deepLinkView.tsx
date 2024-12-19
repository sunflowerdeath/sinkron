import { useState } from "react"
import { observer } from "mobx-react-lite"

import { useDelay } from "~/utils/useDelay"
import { DeepLinkController } from "~/store/deepLink"
import { Col, Dialog, Button, Heading } from "~/ui"

type DeepLinkViewProps = {
    deepLink: DeepLinkController
}

const DeepLinkView = observer((props: DeepLinkViewProps) => {
    const { deepLink } = props

    const [isClosed, setIsClosed] = useState(false)
    const delay = useDelay(222)
    let showDialog = false
    if (delay) {
        const status = deepLink.state.status
        if (status === "pending") {
            showDialog = true
        } else if (status === "failed") {
            showDialog = !isClosed
        } else {
            showDialog = false
        }
    }
    return (
        <Dialog onClose={() => {}} isOpen={showDialog}>
            {() => {
                if (deepLink.state.status === "pending") {
                    return (
                        <Col gap={16}>
                            <Heading>Opening link</Heading>
                            Loading...
                            <Button
                                style={{ alignSelf: "stretch" }}
                                onClick={() => {
                                    deepLink.resolve({ status: "cancelled" })
                                }}
                            >
                                Cancel
                            </Button>
                        </Col>
                    )
                }
                if (deepLink.state.status === "failed") {
                    return (
                        <Col gap={16}>
                            <Heading>Error</Heading>
                            <div style={{ color: "var(--color-error)" }}>
                                Couldn't open link: {deepLink.state.message}
                            </div>
                            <Button
                                style={{ alignSelf: "stretch" }}
                                onClick={() => {
                                    setIsClosed(true)
                                }}
                            >
                                Close
                            </Button>
                        </Col>
                    )
                }
                return null
            }}
        </Dialog>
    )
})

export { DeepLinkView }
