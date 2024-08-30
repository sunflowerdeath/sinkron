import { ajv } from "../ajv"

const credentialsSchema = ajv.compile({
    type: "object",
    properties: {
        name: {
            type: "string",
            minLength: 1,
            maxLength: 25,
            pattern: "^[a-zA-Z0-9_]+$"
        },
        password: {
            type: "string",
            minLength: 1,
            maxLength: 25,
            pattern: "^[^\\s]+$"
        }
    },
    required: ["name", "password"],
    additionalProperties: false
})

export { credentialsSchema }
