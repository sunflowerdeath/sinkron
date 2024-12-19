import { forwardRef } from 'react'
import { useStyles, StyleProps, StyleMap, omitStyleProps } from 'oriente'

interface HeadingProps extends StyleProps<[HeadingProps]> {
    children: React.ReactNode
}

const headingStyles: StyleMap = {
    root: { fontSize: 24, fontWeight: 600, margin: 0 }
}

const Heading = forwardRef<HTMLHeadingElement, HeadingProps>((props, ref) => {
    const { children, ...rest } = omitStyleProps(props)
    const styles = useStyles(headingStyles, [props])
    return (
        <h1 style={styles.root} {...rest} ref={ref}>
            {children}
        </h1>
    )
})

export { Heading }
