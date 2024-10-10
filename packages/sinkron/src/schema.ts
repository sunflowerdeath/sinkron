import { Op } from "./protocol"

const heartbeatMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "h" },
        i: { type: "number" }
    },
    required: ["kind", "i"],
    additionalProperties: false
}

const getMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "get" },
        id: { type: "string" }
    },
    required: ["kind", "id"],
    additionalProperties: false
}

const syncMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "sync" },
        // token: { type: 'string' },
        col: { type: "string" },
        colrev: { type: "integer" }
    },
    required: ["kind", "col"],
    additionalProperties: false
}

const changeMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "change" },
        col: { type: "string" },
        id: { type: "string" },
        changeid: { type: "string" },
        op: { type: "string" },
        data: {
            oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } }
            ]
        }
    },
    required: ["kind", "col", "id", "changeid", "op"],
    additionalProperties: false,
    oneOf: [
        {
            properties: {
                op: { const: Op.Create },
                data: { type: "string" }
            },
            required: ["data"]
        },
        {
            properties: {
                op: { const: Op.Modify },
                data: { type: "array", items: { type: "string" } }
            },
            required: ["data"]
        },
        {
            properties: {
                op: { const: Op.Delete }
            }
        }
    ]
}

const clientMessageSchema = {
    oneOf: [
        heartbeatMessageSchema,
        getMessageSchema,
        syncMessageSchema,
        changeMessageSchema
    ]
}

export { clientMessageSchema }
