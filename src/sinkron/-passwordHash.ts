import * as bcrypt from "bcrypt"

const saltRounds = 5

const generatePasswordHash = async (pwd: string): Promise<string> => {
    return bcrypt.hash(pwd, saltRounds)
}

const validatePasswordHash = async ({
    password,
    hash,
}: {
    password: string
    hash: string
}): Promise<boolean> => {
    return bcrypt.compare(password, hash)
}

export { generatePasswordHash, validatePasswordHash }
