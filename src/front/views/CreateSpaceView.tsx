import { useState } from "react"
import { observer } from 'mobx-react-lite'
import { useLocation } from "wouter"

import { Col } from "oriente"

import { fetchJson, FetchError } from '../fetchJson'
import { useStore } from "../store"
import { Result, ResultType } from '../../utils/result'

import Container from '../ui/Container'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import ButtonsGrid from '../ui/ButtonsGrid'

const CreateSpaceView = observer(() => {
    const store = useStore()

    const [location, navigate] = useLocation()

    const [name, setName] = useState('')

    const [createState, setCreateState] = useState<IPromiseBasedObservable<
        ResultType<object, FetchError>
    > | null>(null)
    const create = async () => {
        const state = store.createSpace(name)
        setCreateState(state)
        const res = await state
        if (res.isOk) {
            store.user!.spaces.push(res.value as Space)
            store.space = res.value as Space
            navigate('/')
        } else {
            alert(res.error)
        }
    }

    return (
        <Container title="Create new space">
            <Col gap={8} style={{ alignSelf: 'stretch' }}>
                Name:
                <Input
                    style={{ width: 400 }}
                    value={name}
                    onChange={(value) => setName(value)}
                />
            </Col>
            <ButtonsGrid>
                <Button>Cancel</Button>
                <Button
                    onClick={create}
                    isDisabled={createState?.state === 'pending'}
                >
                    Create
                </Button>
            </ButtonsGrid>
        </Container>
    )
})

export default CreateSpaceView
