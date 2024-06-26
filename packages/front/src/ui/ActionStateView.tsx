import { useMemo, useState } from "react"
import { IPromiseBasedObservable, fromPromise } from "mobx-utils"
import { observer, Observer } from "mobx-react-lite"

export type ActionState<T> = IPromiseBasedObservable<T>

interface ActionStateViewProps<T> {
    state: ActionState<T>
    ErrorComponent?: React.Component
    PendingComponent?: React.Component
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

const ErrorComponent = (props) => (
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
        return <ErrorComponent>{String(state.value.message)}</ErrorComponent>
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

const initialActionState = makeInitialActionState<object>()

const useActionState = <T = object,>(initialValue: T = null) => {
    return useState<ActionState<T>>(fromPromise.resolve({}) as ActionState<T>)
}

export default ActionStateView
export { makeInitialActionState, initialActionState, useActionState }
