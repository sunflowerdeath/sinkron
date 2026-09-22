import { Logger } from "pino"

interface HeartbeatProps {
    logger?: Logger<string>
    heartbeat: (i: number) => void
    // Interval between sending heartbeat messages
    heartbeatInterval: number
    // Timeout for waiting reply from server
    timeout: number
    onTimeout: () => void
}

const initialHeartbeatDelay = 1000

class Heartbeat {
    props: HeartbeatProps
    heartbeatTimer?: ReturnType<typeof setTimeout>
    timeoutTimer?: ReturnType<typeof setTimeout>

    constructor(props: HeartbeatProps) {
        this.props = props
        this.heartbeatTimer = setTimeout(
            () => this.#sendHeartbeat(1),
            initialHeartbeatDelay
        )
    }

    dispose() {
        clearTimeout(this.heartbeatTimer)
        clearTimeout(this.timeoutTimer)
    }

    #sendHeartbeat(i: number) {
        const { logger, heartbeat, timeout, onTimeout } = this.props
        logger?.debug(`Sending heartbeat: ${i}`, i)
        heartbeat(i)
        clearTimeout(this.timeoutTimer)
        this.timeoutTimer = setTimeout(() => {
            logger?.debug("No heartbeat response for too long, timeout")
            onTimeout()
        }, timeout)
    }

    handleHeartbeatResponse(i: number) {
        this.props.logger?.debug("Recieved hearbeat response")
        // cancel timeout
        clearTimeout(this.timeoutTimer)
        // schedule next hearbeat
        this.heartbeatTimer = setTimeout(
            () => this.#sendHeartbeat(i + 1),
            this.props.heartbeatInterval
        )
    }
}

export { Heartbeat }
