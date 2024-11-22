import assert from "node:assert"
import { inspect } from "node:util"

import { isMatch } from "lodash"

const assertIsMatch = (a: object, b: object) => {
    const match = isMatch(a, b)
    if (!match) {
        assert.fail(
            "Expected objects to match: \n" +
                `Given: ${inspect(a)}\n` +
                `Expected: ${inspect(b)}`
        )
    }
}

export { assertIsMatch }
