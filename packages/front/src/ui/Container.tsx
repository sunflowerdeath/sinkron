import { useMedia } from "react-use"
import { Col, Row, useStyles, StyleProps, StyleMap } from "oriente"

import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import closeSvg from "@material-design-icons/svg/outlined/close.svg"

import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import { Heading } from "../ui/heading"

interface ContainerProps extends StyleProps<[ContainerProps, boolean]> {
    children: React.ReactNode
    title: React.ReactNode
    onClose: () => void
}

const containerStyles = (
    props: ContainerProps,
    isMobile: boolean
): StyleMap => ({
    root: isMobile
        ? {
              position: "relative",
              minHeight: "100dvh",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column"
          }
        : {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              width: 480,
              height: "100dvh",
              borderRight: "2px solid #555",
              overflow: "scroll"
          },
    content: {
        padding: isMobile ? "20px 10px" : "20px 40px",
        flexGrow: 1
    }
})

const Container = (props: ContainerProps) => {
    const { children, title, onClose } = props

    const isMobile = useMedia("(max-width: 1023px)")
    const styles = useStyles(containerStyles, [props, isMobile])

    const heading = (
        <Row
            style={{
                height: 60,
                paddingLeft: isMobile ? 0 : 40
            }}
            gap={8}
            align="center"
        >
            {isMobile && (
                <Button onClick={onClose}>
                    <Icon svg={arrowBackSvg} />
                </Button>
            )}
            {title && <Heading style={{ flexGrow: 1 }}>{title}</Heading>}
            {!isMobile && (
                <Button onClick={onClose}>
                    <Icon svg={closeSvg} />
                </Button>
            )}
        </Row>
    )

    return (
        <div style={styles.root}>
            {heading}
            <Col gap={16} align="normal" style={styles.content}>
                {children}
            </Col>
        </div>
    )
}

export default Container
