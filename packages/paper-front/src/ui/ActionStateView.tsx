import { IPromiseBasedObservable } from 'mobx-utils'
import { observer, Observer } from "mobx-react-lite"

type ActionState<T> = IPromiseBasedObservable<T>

interface ActionStateViewProps<T> {
    state: ActionState<T>
    ErrorComponent?: React.Component
    PendingComponent?: React.Component
    children: React.ReactNode | ((value: T) => React.ReactNode)
}

const PendingComponent = () => <>Loading...</>

const ErrorComponent = () => <>Error</>

const actionStateViewDefaultProps = {
    ErrorComponent,
    PendingComponent
}

const ActionStateView = observer(<T,>(props: ActionStateViewProps<T>) => {
    const { state, ErrorComponent, PendingComponent, children } = {
        ...actionStateViewDefaultProps,
        ...props
    }
    console.log('STATE', state.state, PendingComponent)
    if (state.state === 'pending') {
        return <PendingComponent />
    }
    if (state.state === 'rejected') {
        return <ErrorComponent>{String(state.value)}</ErrorComponent>
    }
    return (
        <Observer>
            {() => (
                <>
                    {(typeof children === 'function'
                        ? children(state.value)
                        : children) || null}
                </>
            )}
        </Observer>
    )
})

export default ActionStateView
