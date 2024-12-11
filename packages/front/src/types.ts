export type SinkronTextElement = {
    text: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
}

export type LinkElement = {
    type: "link"
    url: string
    children: SinkronTextElement[]
}

export type InlineElement = SinkronTextElement | LinkElement

export type TitleElement = {
    type: "title"
    children: InlineElement[]
}

export type HeadingElement = {
    type: "heading"
    children: InlineElement[]
}

export type ParagraphElement = {
    type: "paragraph"
    children: InlineElement[]
}

export type ListItemElement = {
    type: "list-item"
    children: InlineElement[]
}

export type CheckListItemElement = {
    type: "check-list-item"
    isChecked: boolean
    children: InlineElement[]
}

export type ListElement = {
    type: "list"
    children: ListItemElement[]
}

export type CheckListElement = {
    type: "check-list"
    children: CheckListItemElement[]
}

export type OrderedListElement = {
    type: "ordered-list"
    children: ListItemElement[]
}

export type CodeBlockElement = {
    type: "code-block"
    children: CodeLineElement[]
}

export type CodeLineElement = {
    type: "code-line"
    children: string
}

export type ImageElement = {
    type: "image"
    id: string
    status: "uploading" | "error" | "ready"
    error?: string
}

export type SinkronElement =
    | TitleElement
    | HeadingElement
    | ParagraphElement
    | ListItemElement
    | CheckListItemElement
    | ListElement
    | CheckListElement
    | OrderedListElement
    | CodeBlockElement
    | CodeLineElement
    | LinkElement
    | ImageElement

export type TopLevelElement =
    | TitleElement
    | HeadingElement
    | ParagraphElement
    | ListItemElement
    | ListElement
    | CheckListElement
    | OrderedListElement
    | CodeBlockElement
    | ImageElement

export type RootElement = {
    children: TopLevelElement[]
}

declare module "slate" {
    interface CustomTypes {
        Element: SinkronElement
        Text: SinkronTextElement
    }
}
