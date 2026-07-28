import { useMedia } from "react-use"
import { StyleMap, Modal, useModal } from "oriente"

const mobileDialogStyles: StyleMap = {
    window: {
        background: "var(--color-background)",
        padding: 15,
        width: "100%"
    },
    container: {
        alignItems: "flex-end"
    },
    overlay: {
        background: "rgba(15,15,15,.55)"
    }
}

const desktopDialogStyles: StyleMap = {
    window: {
        background: "var(--color-background)",
        padding: 20,
        width: 400
    },
    container: {
        paddingTop: 40,
        alignItems: "center"
    },
    overlay: {
        background: "rgba(15,15,15,.55)"
    }
}

const Dialog = (props: React.ComponentProps<typeof Modal>) => {
    const isMobile = useMedia("(max-width: 767px)")
    const dialogStyles = isMobile ? mobileDialogStyles : desktopDialogStyles
    return <Modal styles={[dialogStyles, props.styles]} {...props} />
}

const useDialog = (children: (close: () => void) => React.ReactNode) =>
    useModal({
        Component: Dialog,
        children
    })

export { Dialog, useDialog }
