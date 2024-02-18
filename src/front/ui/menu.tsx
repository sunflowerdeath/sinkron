import { Menu, MenuItem } from "oriente"

const menuItemStyles = (
    props: React.ComponentProps<typeof MenuItem>,
    state: { isSelected: boolean }
) => ({
    root: {
        padding: 10,
        cursor: 'default',
        background: state.isSelected ? '#666' : 'none'
    }
})

const StyledMenuItem = (props: React.ComponentProps<typeof MenuItem>) => {
    const { styles, ...rest } = props
    return <MenuItem styles={[menuItemStyles, styles]} {...rest} />
}

export { Menu, StyledMenuItem as MenuItem }
