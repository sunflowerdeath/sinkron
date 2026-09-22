export type AutoReconnectProps = {
    initialTimeout?: number
    maxTimeout?: number
    connect: () => void
}

const defaultProps = {
    initialTimeout: 333,
    maxTimeout: 10000
}

class AutoReconnect {
    initialTimeout!: number
    maxTimeout!: number
    connect!: () => void
    currentTimeout: number
    isStopped: boolean = false
    timer?: ReturnType<typeof setTimeout>

    constructor(inProps: AutoReconnectProps) {
        const { initialTimeout, maxTimeout, connect } = {
            ...defaultProps,
            ...inProps
        }
        this.initialTimeout = initialTimeout
        this.maxTimeout = maxTimeout
        this.connect = connect
        this.currentTimeout = this.initialTimeout
        this.connect()
    }

    onOpen() {
        // reset timeout value
        this.currentTimeout = this.initialTimeout
    }

    onClose() {
        if (this.isStopped) return
        this.timer = setTimeout(() => {
            this.connect()
        }, this.currentTimeout)
        // increase timeout value
        this.currentTimeout = Math.min(this.maxTimeout, this.currentTimeout * 2)
    }

    stop() {
        clearTimeout(this.timer)
        this.isStopped = true
    }
}

export { AutoReconnect }
