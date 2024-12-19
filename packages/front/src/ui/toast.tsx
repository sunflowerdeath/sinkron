import { useToast, useStyles, StyleProps, StyleMap } from "oriente"

interface ToastProps extends StyleProps<[ToastProps]> {
    children: React.ReactNode
    variant?: "default" | "error"
}

const toastDefaultProps = {
    variant: "default"
}

type ToastPropsWithDefaults = ToastProps & typeof toastDefaultProps

const toastStyles = (props: ToastPropsWithDefaults): StyleMap => {
    return {
        root: {
            color: "white",
            background: props.variant === "default" ? "#777" : "#a33",
            padding: "12px 32px 12px 16px",
            marginBottom: 16,
            maxWidth: 400,
            boxSizing: "border-box"
        }
    }
}

const Toast = (inProps: ToastProps) => {
    const props = { ...toastDefaultProps, ...inProps } as ToastPropsWithDefaults
    const styles = useStyles(toastStyles, [props])
    return <div style={styles.root}>{props.children}</div>
}

const useStateToast = () => {
    const toast = useToast()
    return {
        success: (children: React.ReactNode) => {
            toast.show({
                children: <Toast>{children}</Toast>
            })
        },
        error: (children: React.ReactNode) => {
            toast.show({
                children: <Toast variant="error">{children}</Toast>
            })
        }
    }
}

export { Toast, useToast, useStateToast }
