import { createTransport, Transporter } from "nodemailer"

export interface SendEmailProps {
    from: string
    name: string
    to: string
    subject: string
    text: string
    html: string
}

export interface EmailSender {
    send(props: SendEmailProps): Promise<void>
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

    async send(props: SendEmailProps) {
        const { from, name, to, subject, text, html } = props

        const info = await this.transport.sendMail({
            from: `"${name}" <${from}>`,
            to,
            subject,
            text,
            html
        })

        console.log("Message sent: %s", info.messageId)
        // Message sent: <d786aa62-4e0a-070a-47ed-0b0666549519@ethereal.email>
    }
}

export { SmtpEmailSender }
