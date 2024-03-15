import { useToast } from "oriente"
import { useStyles, StyleProps, StyleMap } from "oriente"

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
            marginBottom: 16
        }
    }
}

const Toast = (inProps: ToastProps) => {
    const props = { ...toastDefaultProps, ...inProps } as ToastPropsWithDefaults
    const styles = useStyles(toastStyles, [props])
    return <div style={styles.root}>{props.children}</div>
}

export { useToast, Toast }
