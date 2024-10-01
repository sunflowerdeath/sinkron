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

export type CodeElement = {
    type: "code"
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
    | CodeElement
    | LinkElement
    | ImageElement

declare module "slate" {
    interface CustomTypes {
        Element: SinkronElement
        Text: SinkronTextElement
    }
}
