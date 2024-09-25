const validateEmail = (s: string) => s.match(/^.+@.+\..+$/g) !== null // a@a.a

export { validateEmail }

