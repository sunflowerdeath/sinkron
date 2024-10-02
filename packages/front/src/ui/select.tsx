import { Row } from "oriente"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"
import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { Button, Menu, MenuItem, Icon } from "../ui"

export interface SelectOption {
    value: string
    label: React.ReactNode
}

export interface SelectProps {
    value: string | undefined
    onChange: (value: string | undefined) => void
    options: SelectOption[]
    isClearable?: boolean
    placeholder?: React.ReactNode
    style?: React.CSSProperties
}

const Select = (props: SelectProps) => {
    const { value, onChange, options, placeholder, isClearable, style } = props

    const selectedOption =
        value !== undefined ? options.find((o) => o.value === value) : undefined

    const menu = () => {
        return options.length === 0 ? (
            <Row style={{ color: "#999", height: 45 }} align="center">
                No items
            </Row>
        ) : (
            options.map((option) => (
                <MenuItem
                    value={option.value}
                    key={option.value}
                    onSelect={() => onChange(option.value)}
                >
                    {option.label}
                </MenuItem>
            ))
        )
    }

    return (
        <Menu
            menu={menu}
            matchWidth
            autoSelectFirstItem={false}
            maxHeight={240}
            placement={{ padding: 8 }}
        >
            {(ref, { open }) => (
                <Row
                    style={{
                        height: 60,
                        border: "2px solid #999",
                        padding: "0 8px",
                        alignSelf: "normal",
                        boxSizing: "border-box",
                        cursor: "default",
                        ...style
                    }}
                    align="center"
                    ref={ref}
                    onClick={open}
                    gap={8}
                >
                    <div style={{ flexGrow: 1 }}>
                        {selectedOption ? (
                            selectedOption.label
                        ) : (
                            <div style={{ color: "#999" }}>{placeholder}</div>
                        )}
                    </div>
                    {value && isClearable ? (
                        <Button size="s" onClick={() => onChange(undefined)}>
                            <Icon svg={closeSvg} />
                        </Button>
                    ) : (
                        <Icon svg={expandMoreSvg} />
                    )}
                </Row>
            )}
        </Menu>
    )
}

export { Select }
