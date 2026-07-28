import { StyleMap, Modal } from "oriente"

const modalStyles: StyleMap = {
    overlay: {
        background: "rgba(15,15,15,.5)",
    },
    window: {
        background: "var(--color-background)",
        padding: 20
    },
    container: {
        paddingTop: 40
    }
}

const StyledModal = (props: React.ComponentProps<typeof Modal>) => {
    return <Modal {...props} styles={[modalStyles, props.styles]} />
}

export { StyledModal as Modal }
