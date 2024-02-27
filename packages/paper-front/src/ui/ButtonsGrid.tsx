interface ButtonsGridProps {
    children: React.ReactNode
}

const ButtonsGrid = (props: ButtonsGridProps) => {
    return (
        <div
            style={{
                display: 'grid',
                width: 400,
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridGap: 8
            }}
        >
            {props.children}
        </div>
    )
}

export default ButtonsGrid
