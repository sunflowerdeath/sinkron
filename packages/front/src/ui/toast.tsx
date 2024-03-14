import { useToast } from "oriente"

const toastStyle = {
    color: "white",
    background: "#777",
    padding: "12px 32px 12px 16px",
    marginBottom: 16
}

type ToastProps = {
    children: React.ReactNode
}

const Toast = (props: ToastProps) => (
    <div style={toastStyle}>{props.children}</div>
)

export { useToast, Toast }
