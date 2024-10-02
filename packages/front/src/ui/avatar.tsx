const stringToColor = (str: string, s: number = 75, l: number = 35) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = hash % 360
    return 'hsl(' + h + ', ' + s + '%, ' + l + '%)'
}

interface AvatarProps {
    name: string
}

const Avatar = (props: AvatarProps) => (
    <div
        style={{
            width: 45,
            height: 45,
            flexShrink: 0,
            borderRadius: 12,
            background:
                props.name?.length > 0 ? stringToColor(props.name) : '#ccc',
            fontSize: 24,
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex'
        }}
    >
        {props.name?.slice(0, 1).toUpperCase()}
    </div>
)

export { Avatar }
