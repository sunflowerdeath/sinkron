import { useMemo, useState } from "react"
import { IPromiseBasedObservable, fromPromise } from "mobx-utils"
import { observer, Observer } from "mobx-react-lite"

export type ActionState<T> = IPromiseBasedObservable<T>

export interface ActionStateViewProps<T> {
    state: ActionState<T>
    ErrorComponent?: React.ComponentType<ErrorComponentProps>
    PendingComponent?: React.ComponentType
    children: React.ReactNode | ((value: T) => React.ReactNode)
}

const PendingComponent = () => (
    <div
        style={{
            color: "var(--color-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 120
        }}
        className="fadeInDelay"
    >
        Loading...
    </div>
)

type ErrorComponentProps = {
    children: React.ReactNode
}

const ErrorComponent = (props: ErrorComponentProps) => (
    <div style={{ color: "var(--color-error)" }}>Error: {props.children}</div>
)

const actionStateViewDefaultProps = {
    ErrorComponent,
    PendingComponent
}

const ActionStateView = observer(<T,>(props: ActionStateViewProps<T>) => {
    const { state, ErrorComponent, PendingComponent, children } = {
        ...actionStateViewDefaultProps,
        ...props
    }
    const wasInitiallyFulfilled = useMemo(() => state.state === "fulfilled", [])
    if (state.state === "pending") {
        return <PendingComponent />
    }
    if (state.state === "rejected") {
        const error = state.value
        const message =
            error instanceof Error ? String(error.message) : "Unknown error"
        return <ErrorComponent>{message}</ErrorComponent>
    }
    return (
        <Observer>
            {() => (
                <div className={wasInitiallyFulfilled ? "" : "fadeIn"}>
                    {(typeof children === "function"
                        ? children(state.value)
                        : children) || null}
                </div>
            )}
        </Observer>
    )
})

const makeInitialActionState = <T,>() =>
    fromPromise.resolve({}) as ActionState<T>

const initialActionState = makeInitialActionState<any>()

const useActionState = <T = object,>(initialValue: T = null as T) => {
    return useState<ActionState<T>>(fromPromise.resolve(initialValue))
}

export default ActionStateView
export { makeInitialActionState, initialActionState, useActionState }
