import { ObservableMap } from "mobx"
import { createTransformer, ITransformer } from "mobx-utils"

interface TransformedMapProps<
    A extends object,
    B extends object,
    Af extends object = A
> {
    source: ObservableMap<string, A>
    filter?: (item: A) => boolean
    transform: (item: Af) => B
}

class TransformedMap<
    A extends object,
    B extends object,
    Af extends object = A
> {
    constructor({ source, filter, transform }: TransformedMapProps<A, B, Af>) {
        this.source = source
        const itemTransformer = createTransformer(transform)
        this.transformer = createTransformer(
            (collection: ObservableMap<string, A>) => {
                const res = new ObservableMap<string, B>()
                for (const [key, item] of collection.entries()) {
                    if (filter === undefined || filter(item)) {
                        res.set(key, itemTransformer(item as any as Af))
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
