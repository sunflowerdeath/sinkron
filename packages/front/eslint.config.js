const js = require("@eslint/js")
const tseslint = require("typescript-eslint")
const globals = require("globals")

module.exports = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            sourceType: "module",
            parser: tseslint.parser,
            globals: {
                ...globals.browser
            }
        },
        files: ["src/**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { destructuredArrayIgnorePattern: "^_" }
            ]
        }
    }
]
