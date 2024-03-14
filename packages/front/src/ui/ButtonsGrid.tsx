interface ButtonsGridProps {
    children: React.ReactNode
}

const ButtonsGrid = (props: ButtonsGridProps) => {
    return (
        <div
            style={{
                display: 'grid',
                maxWidth: 400,
                width: "100%",
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridGap: 8
            }}
        >
            {props.children}
        </div>
    )
}

export default ButtonsGrid
