import { useState, useEffect } from "react"

const useDelay = (delay: number) => {
    const [isOver, setIsOver] = useState(false)
    useEffect(() => {
        const timeout = setTimeout(() => setIsOver(true), delay)
        return () => clearTimeout(timeout)
    }, [])
    return isOver
}

export { useDelay }
