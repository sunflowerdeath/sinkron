import { useMemo, createContext, useContext } from 'react'
import { makeObservable, observable, computed } from 'mobx'

type CurrentRoute = { id: string; props?: object }

type Route = { id: string; render: (props?: object) => React.ReactNode }

const StackNavigatorContext = createContext<StackNavigator>()

const useStackContext = () => useContext(StackNavigatorContext)

type StackNavigatorProps = { routes: Route[]; initialRoute?: CurrentRoute }

class StackNavigator {
    stack: CurrentRoute[] = []
    routes: Route[]

    constructor(props: StackNavigatorProps) {
        const { routes, initialRoute } = props
        this.routes = routes
        if (initialRoute) this.navigate(initialRoute)

        makeObservable(this, {
            stack: observable.shallow,
            current: computed
        })
    }

    navigate(route: CurrentRoute) {
        this.stack.push(route)
    }

    goBack() {
        this.stack.pop()
    }

    get current() {
        return this.stack[this.stack.length - 1]
    }

    render() {
        const { id, props } = this.current
        const route = this.routes.find((r) => r.id === id)
        if (!route) throw new Error('Invalid route: ' + id)
        return (
            <StackNavigatorContext.Provider value={this}>
                {route.render(props)}
            </StackNavigatorContext.Provider>
        )
    }
}

const useStack = (props: StackNavigatorProps) =>
    useMemo(() => new StackNavigator(props), [])

export { useStack, useStackContext }
