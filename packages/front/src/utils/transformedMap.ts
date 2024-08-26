import { ObservableMap } from "mobx"
import { createTransformer, ITransformer } from "mobx-utils"

interface TransformedMapProps<A extends object, B extends object> {
    source: ObservableMap<string, A>
    filter?: (item: A) => boolean
    transform: (item: A) => B
}

class TransformedMap<A extends object, B extends object> {
    constructor({ source, filter, transform }: TransformedMapProps<A, B>) {
        this.source = source
        const itemTransformer = createTransformer(transform)
        this.transformer = createTransformer(
            (collection: ObservableMap<string, A>) => {
                const res = new ObservableMap<string, B>()
                for (const [key, item] of collection.entries()) {
                    if (filter === undefined || filter(item)) {
                        res.set(key, itemTransformer(item))
                    }
                }
                return res
            }
        )
    }

    transformer: ITransformer<
        ObservableMap<string, A>,
        ObservableMap<string, B>
    >
    source: ObservableMap<string, A>

    get map() {
        return this.transformer(this.source)
    }
}

export { TransformedMap }
