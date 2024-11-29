import { createTransport, Transporter } from "nodemailer"

import { Result, ResultType } from "./utils/result"
import { ErrorCode, RequestError } from "./error"

export interface SendEmailProps {
    from: string
    sender: string
    to: string
    subject: string
    text: string
    html: string
}

export interface EmailSender {
    send(props: SendEmailProps): Promise<ResultType<true, RequestError>>
}

interface SmtpEmailSenderProps {
    host: string
    port: number
    secure: boolean
    user: string
    password: string
}

class SmtpEmailSender implements EmailSender {
    transport: Transporter

    constructor(props: SmtpEmailSenderProps) {
        const { host, port, secure, user, password } = props
        this.transport = createTransport({
            host,
            port,
            secure,
            auth: { user, pass: password }
        })
    }

    async send(props: SendEmailProps): Promise<ResultType<true, RequestError>> {
        const { from, sender, to, subject, text, html } = props

        try {
            const info = await this.transport.sendMail({
                from: `"${sender}" <${from}>`,
                to,
                subject,
                text,
                html
            })

            console.log("Message sent: %s", info.messageId)
            return Result.ok(true)
        } catch (e) {
            console.log("Couldn't send email", e)
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Email transport error"
            })
        }
    }
}

class FakeEmailSender implements EmailSender {
    async send(props: SendEmailProps): Promise<ResultType<true, RequestError>> {
        console.log("Email sent")
        console.log(props)
        return Result.ok(true)
    }
}

export { SmtpEmailSender, FakeEmailSender }
