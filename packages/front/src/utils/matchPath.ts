import { parse } from "regexparam"

type MatchPathProps = {
    pattern: string
    path: string
}

const matchPath = (props: MatchPathProps) => {
    const { pattern, path } = props
    const parsed = parse(pattern)

    const matches = parsed.pattern.exec(path)
    if (matches === null) return undefined

    const res: { [key: string]: string } = {}
    parsed.keys.forEach((key, idx) => {
        res[key] = matches[idx + 1]
    })
    return res
}

export { matchPath }
