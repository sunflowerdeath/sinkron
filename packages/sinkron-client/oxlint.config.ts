export default {
    plugins: ["typescript", "unicorn", "oxc"],
    categories: {
        correctness: "error",
        suspicious: "warn",
        pedantic: "off",
    },
    rules: {
        "no-shadow": "off",
    },
    env: {
        builtin: true,
    },
}
