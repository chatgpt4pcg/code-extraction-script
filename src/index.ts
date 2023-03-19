import fs from 'fs'
import parseArgs from 'minimist'
import path from 'path'

const outputFolder = path.posix.resolve('./intermediate/');
const dateTimeString = new Date().toISOString()

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args['s'] === undefined) {
    throw Error('Insufficient parameters to work with.')
  }

  const sourceFolder = args['s'] + '/'
  const sFolder = path.posix.resolve(sourceFolder)
  processFolder(sFolder)
}

async function processFolder(sourceFolder: string) {
  const files = await fs.promises.readdir(sourceFolder);
  for (const file of files) {
    const fPath = path.posix.join(sourceFolder, file)
    const stats = await fs.promises.stat(fPath)

    if (stats.isDirectory()) {
      const nextFolder = path.posix.join(sourceFolder, file)
      processFolder(nextFolder)
    } else {
      extractCode(fPath, file)
    }
  }
}

async function extractCode(filePath: string, file: string) {
  const outputPath = filePath.replace(file, '').split('/').slice(2).join('/');

  if (file.indexOf('.txt') === -1) {
    return
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  outputPath.split('/').slice(-3, -1).reduce((acc, curr) => {
    const folder = path.posix.join(acc, curr)
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    return folder
  }, outputFolder)

  const raw = await fs.promises.readFile(filePath)
  const text = raw.toString('utf-8')

  const extractedCode = extractString(text)
  const isSuccess = extractedCode !== null
  const logMessage = `${new Date()} - ${file} - ${isSuccess ? 'Success' : 'Failed'}`

  console.log(logMessage)

  const finalOutputFolder = outputPath.split('/').slice(-3, -1).join('/')

  await fs.promises.appendFile(path.posix.join(outputFolder, finalOutputFolder, `_log_${dateTimeString}.txt`), logMessage + '\n')
  if (isSuccess) {
    await fs.promises.writeFile(path.posix.join(outputFolder, finalOutputFolder, file), extractedCode.trim())
  }
}

function extractString(text: string): string | null {
  const PATTERN = /```([^`]+)```/g;
  const CODE_PATTERN = /ab\_drop\(['|"]b[1|3][1|3]['|"], *\d*\)/g;

  let match;
  let lastMatch = null;
  while ((match = PATTERN.exec(text)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) {
    return null
  }
  const code = lastMatch[0]
  const functionCode = code.matchAll(CODE_PATTERN)

  let output = ''
  for (const fn of functionCode) {
    output += fn.toString().replaceAll('"', "'") + '\n'
  }

  if (output.length === 0) {
    return null
  }

  return output;
}

main()