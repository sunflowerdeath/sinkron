import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import { useStore } from "../store"

import { Input } from "../ui/input"
import { Heading } from "../ui/heading"
import { Button } from "../ui/button"

const CreateCategoryView = observer(() => {
    const store = useStore()
    const [location, navigate] = useLocation()

    const [name, setName] = useState('')
    const create = () => {
        const id = store.spaceStore!.createCategory(name, undefined)
        store.spaceStore!.selectCategory(id)
        navigate('/')
    }

    return (
        <Col gap={20}>
            <Heading>Create new category</Heading>
            <Col gap={8} style={{ alignSelf: 'stretch' }}>
                Name:
                <Input
                    style={{ width: 400 }}
                    value={name}
                    onChange={(value) => setName(value)}
                />
            </Col>
            <Button onClick={create}>Create</Button>
        </Col>
    )
})

export default CreateCategoryView
