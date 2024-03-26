import { IPromiseBasedObservable, fromPromise } from "mobx-utils"
import { observer, Observer } from "mobx-react-lite"

export type ActionState<T> = IPromiseBasedObservable<T>

interface ActionStateViewProps<T> {
    state: ActionState<T>
    ErrorComponent?: React.Component
    PendingComponent?: React.Component
    children: React.ReactNode | ((value: T) => React.ReactNode)
}

const PendingComponent = () => <>Loading...</>

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
    if (state.state === "pending") {
        return <PendingComponent />
    }
    if (state.state === "rejected") {
        return <ErrorComponent>{String(state.value.message)}</ErrorComponent>
    }
    return (
        <Observer>
            {() => (
                <div className="fadeIn">
                    {(typeof children === "function"
                        ? children(state.value)
                        : children) || null}
                </div>
            )}
        </Observer>
    )
})

export const makeInitialActionState = <T,>() =>
    fromPromise.resolve({}) as ActionState<T>

export const initialActionState = makeInitialActionState<object>()

export default ActionStateView
