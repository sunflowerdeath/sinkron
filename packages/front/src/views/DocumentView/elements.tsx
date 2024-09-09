import { useCallback } from "react"
import { Transforms, Editor } from "slate"
import {
    ReactEditor,
    useSlateStatic,
    useFocused,
    useSelected,
    // useReadOnly,
    RenderElementProps,
    RenderLeafProps
} from "slate-react"
import { Popup, mergeRefs } from "oriente"

import checkBox from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutline from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"

import { Button, Icon } from "../../ui"
import {
    SinkronTextElement,
    TitleElement,
    HeadingElement,
    CheckListItemElement,
    LinkElement
} from "../../types"

export type CustomRenderElementProps<T> = Omit<
    RenderElementProps,
    "element"
> & {
    element: T
}

export type CustomRenderLeafProps = RenderLeafProps & {
    leaf: SinkronTextElement
}

const Title = (props: CustomRenderElementProps<TitleElement>) => {
    const { element } = props
    const editor = useSlateStatic()
    const placeholder = Editor.isEmpty(editor, element) && (
        <div
            style={{
                opacity: 0.5,
                position: "absolute",
                top: 0,
                left: 0,
                userSelect: "none",
                pointerEvents: "none"
            }}
            contentEditable={false}
        >
            Title
        </div>
    )
    return (
        <div
            style={{
                fontSize: 28,
                lineHeight: "135%",
                marginBottom: 30,
                fontWeight: 650,
                position: "relative"
            }}
            {...props.attributes}
        >
            {props.children}
            {placeholder}
        </div>
    )
}

const Heading = (props: CustomRenderElementProps<HeadingElement>) => {
    return (
        <h3
            style={{
                fontSize: 22.5,
                fontWeight: 650,
                lineHeight: "135%",
                margin: "2rem 0 1rem"
            }}
            {...props.attributes}
        >
            {props.children}
        </h3>
    )
}

const Link = (props: CustomRenderElementProps<LinkElement>) => {
    const { element, attributes, children } = props
    const isFocused = useFocused()
    const isSelected = useSelected()

    const popup = useCallback(
        (ref: React.RefObject<HTMLDivElement>) => (
            <div
                ref={ref}
                style={{
                    display: "flex",
                    alignItems: "center",
                    height: 45,
                    padding: "0 8px",
                    background: "var(--color-elem)",
                    willChange: "transform",
                    minWidth: 60,
                    maxWidth: 200,
                    overflow: "hidden",
                    fontSize: ".85rem"
                }}
                onMouseDown={(e) => {
                    // prevent blur
                    e.preventDefault()
                }}
            >
                <a
                    href={element.url}
                    style={{
                        color: "var(--color-link)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                    }}
                    target="_blank"
                >
                    {element.url}
                </a>
            </div>
        ),
        [element.url]
    )

    return (
        <Popup
            popup={popup}
            isActive={isFocused && isSelected}
            placement={{
                side: "bottom",
                align: "center",
                offset: 4,
                padding: 4,
                constrain: true
            }}
        >
            {(ref) => (
                <span
                    style={{ color: "var(--color-link)" }}
                    {...attributes}
                    ref={mergeRefs(ref, attributes.ref)}
                >
                    {children}
                </span>
            )}
        </Popup>
    )
}

const CheckListItem = (
    props: CustomRenderElementProps<CheckListItemElement>
) => {
    const { attributes, children, element } = props
    const editor = useSlateStatic() as ReactEditor
    // const readOnly = useReadOnly()

    const toggle = () => {
        const path = ReactEditor.findPath(editor, element)
        const newProps = { isChecked: !element.isChecked }
        Transforms.setNodes(editor, newProps, { at: path })
    }

    return (
        <li
            style={{
                margin: ".25rem 0",
                listStyleType: "none",
                display: "flex",
                alignItems: "center",
                gap: 4
            }}
            {...attributes}
        >
            <div contentEditable={false}>
                <Button size="s" onClick={toggle} kind="transparent">
                    <Icon
                        svg={element.isChecked ? checkBox : checkBoxOutline}
                    />
                </Button>
            </div>
            {children}
        </li>
    )
}

const EditorElement = (props: RenderElementProps) => {
    switch (props.element.type) {
        case "paragraph":
            return <p {...props.attributes}>{props.children}</p>
        case "title":
            return (
                <Title {...(props as CustomRenderElementProps<TitleElement>)} />
            )
        case "heading":
            return (
                <Heading
                    {...(props as CustomRenderElementProps<HeadingElement>)}
                />
            )
        case "link":
            return (
                <Link {...(props as CustomRenderElementProps<LinkElement>)} />
            )
        case "code":
            return (
                <pre
                    style={{
                        padding: 8,
                        border: "2px solid var(--color-elem)"
                    }}
                    {...props.attributes}
                >
                    {props.children}
                </pre>
            )
        case "list":
            return (
                <ul style={{ margin: 0 }} {...props.attributes}>
                    {props.children}
                </ul>
            )
        case "ordered-list":
            return <ol {...props.attributes}>{props.children}</ol>
        case "list-item":
            return (
                <li style={{ margin: ".5rem 0" }} {...props.attributes}>
                    {props.children}
                </li>
            )
        case "check-list-item":
            return (
                <CheckListItem
                    {...(props as CustomRenderElementProps<CheckListItemElement>)}
                />
            )
    }
    return <span {...props.attributes}>{props.children}</span>
}

const EditorLeaf = (props: CustomRenderLeafProps) => {
    const { attributes, leaf } = props

    let children = props.children
    if (leaf.bold) {
        children = <strong style={{ fontWeight: 800 }}>{children}</strong>
    }

    if (leaf.italic) {
        children = <em>{children}</em>
    }

    if (leaf.underline) {
        children = <u>{children}</u>
    }

    if (leaf.strikethrough) {
        children = (
            <span style={{ textDecoration: "line-through" }}>{children}</span>
        )
    }

    return <span {...attributes}>{children}</span>
}

export { EditorElement, EditorLeaf }
