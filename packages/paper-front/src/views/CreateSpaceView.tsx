import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useLocation } from 'wouter'

import { Col } from 'oriente'

import { fetchJson, FetchError } from '../fetchJson'
import { useStore } from '../store'
import { Result, ResultType } from '../../utils/result'

import { Heading } from '../ui/heading'
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
            const space = res.value as Space
            store.user.spaces.push(space)
            store.spaceId = res.value.id
            navigate('/')
        } else {
            alert(res.error)
        }
    }

    return (
        <Col gap={20}>
            <Heading>Create new space</Heading>
            <Col gap={8} style={{ alignSelf: 'stretch' }}>
                Name:
                <Input
                    style={{ width: 400 }}
                    value={name}
                    onChange={(value) => setName(value)}
                />
            </Col>
            <Button
                onClick={create}
                isDisabled={createState?.state === 'pending'}
                style={{ alignSelf: 'stretch' }}
            >
                Create
            </Button>
        </Col>
    )
})

export default CreateSpaceView
