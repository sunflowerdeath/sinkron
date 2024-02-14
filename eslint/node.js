module.exports = {
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        typescript: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "prettier",
    ],
    plugins: ["@typescript-eslint", "import"],
    settings: {
        "import/resolver": "webpack",
    },
    env: {
        node: true,
    },

    overrides: [
        {
            files: ["*.test.ts"],
            extends: ["plugin:mocha/recommended"],
            rules: {
                "mocha/no-mocha-arrows": 0
            }
        },
    ],
}
