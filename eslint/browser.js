module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        ecmaFeatures: {
            jsx: true,
        },
        typescript: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/errors",
        "prettier",
    ],
    plugins: ["@typescript-eslint"],
    settings: {
        "import/resolver": "webpack",
    },
    env: {
        browser: true,
    },
}
