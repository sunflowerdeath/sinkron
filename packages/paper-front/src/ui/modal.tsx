import { StyleMap, Modal } from 'oriente'

const modalStyles: StyleMap = {
    window: {
        background: 'var(--color-background)',
        padding: 20
    },
    container: {
        paddingTop: 40
    }
}

const StyledModal = (props: React.ComponentProps<typeof Modal>) => {
    return <Modal styles={[modalStyles, props.styles]} {...props} />
}

export { StyledModal as Modal }
