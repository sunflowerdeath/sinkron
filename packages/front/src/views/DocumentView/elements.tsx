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
import { observer } from "mobx-react"
import { Img } from "react-image"

import checkBox from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutline from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"

import env from "../../env"
import { useSpace } from "../../store"
import { Button, Icon } from "../../ui"
import {
    SinkronTextElement,
    TitleElement,
    HeadingElement,
    CheckListItemElement,
    ImageElement,
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

const ImagePlaceholder = (props: { children: React.ReactNode }) => {
    return (
        <div
            style={{
                width: 300,
                height: 200,
                boxSizing: "border-box",
                background:
                    "color-mix(in srgb, var(--color-elem) 33%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 15
            }}
        >
            {props.children}
        </div>
    )
}

const ImageComponent = observer(
    (props: CustomRenderElementProps<ImageElement>) => {
        const { attributes, element, children } = props
        const { id, status, error } = element

        const isSelected = useSelected()

        let content
        if (status !== "ready") {
            let statusText = null
            if (status === "uploading") {
                statusText = "Uploading image..."
            } else if (status === "error") {
                statusText = (
                    <span style={{ color: "var(--color-error)" }}>
                        Image upload error:
                        <br />
                        {error ?? "Unknown error"}
                    </span>
                )
            }
            content = <ImagePlaceholder>{statusText}</ImagePlaceholder>
        } else {
            const src = env.isProductionEnv
                ? `https://s3.timeweb.cloud/aaf9ded1-sinkron/${id}`
                : `${env.apiUrl}/files/${id}`
            content = (
                <Img
                    src={src}
                    style={{
                        maxWidth: "100%",
                        maxHeight: "66vh"
                    }}
                    loader={
                        <ImagePlaceholder>Loading image...</ImagePlaceholder>
                    }
                    unloader={
                        <ImagePlaceholder>
                            <span style={{ color: "var(--color-error)" }}>
                                Couldn't load image
                            </span>
                        </ImagePlaceholder>
                    }
                />
            )
        }

        return (
            <div
                contentEditable={false}
                {...attributes}
                style={{
                    margin: "1rem 0",
                    display: "flex",
                    alignItems: "start"
                }}
            >
                {children}
                <div
                    style={{
                        minHeight: 100,
                        minWidth: 100,
                        maxHeight: "66vh",
                        maxWidth: "100%",
                        outline: isSelected
                            ? "4px solid var(--color-link)"
                            : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}
                >
                    {content}
                </div>
            </div>
        )
    }
)

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
        case "image":
            return (
                <ImageComponent
                    {...(props as CustomRenderElementProps<ImageElement>)}
                />
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

const PostTitle = (props: CustomRenderElementProps<TitleElement>) => {
    const { children, attributes } = props
    return (
        <div
            style={{
                fontSize: 42,
                lineHeight: "135%",
                marginBottom: 30,
                fontWeight: 650,
                position: "relative"
            }}
            {...attributes}
        >
            {children}
        </div>
    )
}

const PostLink = (props: CustomRenderElementProps<LinkElement>) => {
    const { element, attributes, children } = props
    return (
        <a
            href={element.url}
            target="_blank"
            style={{ color: "var(--color-link)", textDecoration: "underline" }}
            {...attributes}
        >
            {children}
        </a>
    )
}

const PostImage = observer((props: CustomRenderElementProps<ImageElement>) => {
    const { attributes, element, children } = props
    const { id, status } = element

    let content
    if (status !== "ready") {
        content = (
            <ImagePlaceholder>
                <span style={{ color: "var(--color-error)" }}>
                    Couldn't load image
                </span>
            </ImagePlaceholder>
        )
    } else {
        const src = env.isProductionEnv
            ? `https://s3.timeweb.cloud/aaf9ded1-sinkron/${id}`
            : `${env.apiUrl}/files/${id}`
        content = (
            <Img
                src={src}
                style={{
                    maxWidth: "100%",
                    maxHeight: "80vh"
                }}
                loader={<ImagePlaceholder>Loading image...</ImagePlaceholder>}
                unloader={
                    <ImagePlaceholder>
                        <span style={{ color: "var(--color-error)" }}>
                            Couldn't load image
                        </span>
                    </ImagePlaceholder>
                }
            />
        )
    }

    return (
        <div
            contentEditable={false}
            {...attributes}
            style={{
                margin: "1rem 0",
                display: "flex",
                justifyContent: "center"
            }}
        >
            {children}
            {content}
        </div>
    )
})

const PostElement = (props: RenderElementProps) => {
    switch (props.element.type) {
        case "paragraph":
            return <p {...props.attributes}>{props.children}</p>
        case "title":
            return (
                <PostTitle
                    {...(props as CustomRenderElementProps<TitleElement>)}
                />
            )
        case "heading":
            return (
                <Heading
                    {...(props as CustomRenderElementProps<HeadingElement>)}
                />
            )
        case "link":
            return (
                <PostLink
                    {...(props as CustomRenderElementProps<LinkElement>)}
                />
            )
        case "image":
            return (
                <PostImage
                    {...(props as CustomRenderElementProps<ImageElement>)}
                />
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

export { EditorElement, EditorLeaf, PostElement }
