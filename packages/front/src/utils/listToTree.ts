export type ListItem = { id: string; parent: string | null }

export type TreeNode<T extends object> = T & { children: TreeNode<T>[] }

export type Tree<T extends object> = TreeNode<T>[]

const listToTree = <T extends ListItem>(list: T[]): Tree<T> => {
    const index: { [id: string]: TreeNode<T> } = {}
    list.forEach((c) => {
        index[c.id] = { ...c, children: [] }
    })
    const tree: TreeNode<T>[] = []
    list.forEach((item) => {
        const node = index[item.id]
        if (item.parent) {
            const parentNode = index[item.parent]
            parentNode.children.push(node)
        } else {
            tree.push(node)
        }
    })
    return tree
}

export default listToTree
