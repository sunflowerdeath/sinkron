interface ButtonsGridProps {
    children: React.ReactNode
    style?: React.CSSProperties
}

const ButtonsGrid = (props: ButtonsGridProps) => {
    return (
        <div
            style={{
                display: 'grid',
                maxWidth: 400,
                width: "100%",
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridGap: 8,
                boxSizing: "border-box",
                ...props.style
            }}
        >
            {props.children}
        </div>
    )
}

export default ButtonsGrid
