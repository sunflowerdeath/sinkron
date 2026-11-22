export type ExponentialBackoffProps = {
    initialTimeout: number
    maxTimeout: number
}

class ExponentialBackoff {
    props: ExponentialBackoffProps
    currentTimeout: number
    timer?: ReturnType<typeof setTimeout>

    constructor(props: ExponentialBackoffProps) {
        this.props = props
        this.currentTimeout = this.props.initialTimeout
    }

    schedule(cb: () => void) {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => cb(), this.currentTimeout)
        this.currentTimeout = Math.min(
            this.props.maxTimeout,
            this.currentTimeout * 2,
        )
    }

    reset() {
        this.currentTimeout = this.props.initialTimeout
        clearTimeout(this.timer)
    }
}

export { ExponentialBackoff }
