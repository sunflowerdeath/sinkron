export type NumFormProps = {
    one: string
    two?: string
    many: string
}

const numForm = (num: number, forms: NumFormProps) => {
    let form: string = ""
    if (num === 1) form = forms.one
    else if (num === 2) form = forms.two || forms.many
    else form = forms.many
    return `${num} ${form}`
}

export default numForm
