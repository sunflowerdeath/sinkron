import { useState } from 'react'
import { Link } from 'wouter'
import { Col, Row } from 'oriente'
import { without } from 'lodash-es'

import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Heading } from '../ui/heading'
import ButtonsGrid from '../ui/ButtonsGrid'

import CategoriesList from '../components/CategoriesList'

import { useStore } from '../store'

import checkBoxSvg from '@material-design-icons/svg/outlined/check_box.svg'
import checkBoxOutlineSvg from '@material-design-icons/svg/outlined/check_box_outline_blank.svg'
import expandMoreSvg from '@material-design-icons/svg/outlined/expand_more.svg'
import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { Category, Node } from '../store'

interface CategoriesTreeItemProps {
    value: string[]
    onChange: (value: string[]) => void
    category: Node<Category>
}

const CategoriesTreeItem = (props: CategoriesTreeItemProps) => {
    const { category, value, onChange } = props
    const hasChildren = category.children !== undefined

    const isSelected = value.includes(category.id)
    return (
        <Col gap={8} style={{ alignSelf: 'stretch' }}>
            <Row align="center" style={{ alignSelf: 'stretch' }} gap={8}>
                <Button
                    kind="transparent"
                    style={{ flexGrow: 1, justifyContent: 'start', gap: 8 }}
                    onClick={() => {
                        const nextValue = isSelected
                            ? without(value, category.id)
                            : [...value, category.id]
                        onChange(nextValue)
                    }}
                >
                    <Icon svg={isSelected ? checkBoxSvg : checkBoxOutlineSvg} />
                    <div style={{ flexGrow: 1 }}>{category.name}</div>
                </Button>
            </Row>
            <div style={{ marginLeft: 32, alignSelf: 'stretch' }}>
                {hasChildren && (
                    <CategoriesTree
                        value={value}
                        onChange={onChange}
                        categories={category.children}
                    />
                )}
            </div>
        </Col>
    )
}

interface CategoriesTreeProps {
    value: string[]
    onChange: (value: string[]) => void
    categories: Node<Category>[]
}

const CategoriesTree = (props: CategoriesTreeProps) => {
    const { categories, value, onChange } = props

    return (
        <Col style={{ alignSelf: 'stretch' }}>
            {categories.map((c) => (
                <CategoriesTreeItem
                    category={c}
                    value={value}
                    onChange={onChange}
                />
            ))}
        </Col>
    )
}

interface SelectCategoriesViewProps {
    value: string[]
    onChange: (value: string[]) => void
    categories: Node<Category>[]
}

const SelectCategoriesView = (props: SelectCategoriesViewProps) => {
    const { categories, onChange, value } = props
    return (
        <Col gap={20} style={{ padding: '0 40px', height: "100%" }} align="normal">
            <Row style={{ height: 60, alignSelf: 'stretch' }} align="center">
                <Heading style={{ flexGrow: 1 }}>Select categories</Heading>
            </Row>
            <Button as={Link} to="/categories">
                Manage categories
            </Button>
            <div style={{ flexGrow: 1 }}>
            <CategoriesTree
                categories={categories}
                value={value}
                onChange={onChange}
            />
            </div>
            <CategoriesList
                items={value.map((id) => ({
                    id,
                    name: categories.find((c) => c.id === id).name
                }))}
                onRemove={(id) => onChange(without(value, id))}
            />
        </Col>
    )
}

export default SelectCategoriesView
