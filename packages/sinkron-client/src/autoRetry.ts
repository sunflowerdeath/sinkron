export type AutoRetryProps = {
    initialTimeout: number
    maxTimeout: number
}

const defaultProps = {
    initialTimeout: 333,
    maxTimeout: 10000
}

const autoRetry = (
    cb: (retry: () => void) => void,
    props: Partial<AutoRetryProps> = {}
) => {
    const { initialTimeout, maxTimeout } = { ...defaultProps, ...props }
    let timeout = initialTimeout
    let timer: ReturnType<typeof setTimeout> | undefined
    const retry = () => {
        timer = setTimeout(() => cb(retry), timeout)
        timeout = Math.min(maxTimeout, timeout * 2)
    }
    cb(retry)
    const stop = () => {
        clearTimeout(timer)
    }
    return stop
}

export { autoRetry }
