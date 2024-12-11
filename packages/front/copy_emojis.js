import fs from "node:fs"
import path from "node:path"

const inputFile = "./emojis.txt"
const inputDir = "./temp/SerenityOS-RGI-emoji"
const outDir = "./src/emojis"

const input = fs.readFileSync(inputFile, "utf-8")

let imports = ""
let exports = ""

input.split("\n").map((line) => {
    if (line.length === 0) return
    const [_, name, filename] = line.split(" - ")
    const resName = name.toLowerCase().replace(/-/g, "_").replace(/ /g, "_")
    fs.copyFileSync(
        path.join(inputDir, filename),
        path.join(outDir, resName + ".png")
    )
    imports += `import ${resName} from "./${resName}.png"\n`
    exports += `    ${resName},\n`
})

const module = `${imports}
const emojis = {
${exports}}

export default emojis
`

fs.writeFileSync(
    path.join(outDir, "index.ts"),
    module
)
