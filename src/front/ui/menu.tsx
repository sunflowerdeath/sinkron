import { Menu, MenuItem, StyleMap } from 'oriente'

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

const menuStyles: StyleMap = {
    list: {
        background: '#555',
        padding: 8,
        boxSizing: 'border-box',
        boxShadow:
            'rgb(51 51 51 / 40%) 0px 0px 12px 0px,' +
            'rgb(51 51 51 / 40%) 0px 0px 2px 0px'
    }
}

const StyledMenu = (props: React.ComponentProps<typeof Menu>) => {
    const { styles, ...rest } = props
    return <Menu styles={[menuStyles, styles]} {...rest} />
}

export { StyledMenu as Menu, StyledMenuItem as MenuItem }
