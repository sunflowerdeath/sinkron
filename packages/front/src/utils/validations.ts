const validateEmail = (s: string) =>
    s.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) !== null // a@a.a

export { validateEmail }
