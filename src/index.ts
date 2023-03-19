import fs from 'fs'
import parseArgs from 'minimist'

const outputFolder = './intermediate/';
const dateTimeString = new Date().toISOString()

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args['s'] === undefined) {
    throw Error('Insufficient parameters to work with.')
  }

  const sourceFolder = args['s'] + '/'
  processFolder(sourceFolder)
}

async function processFolder(sourceFolder: string) {
  const files = await fs.promises.readdir(sourceFolder);
  for (const file of files) {
    const stats = await fs.promises.stat(sourceFolder + file)

    if (stats.isDirectory()) {
      processFolder(sourceFolder + file + '/')
    } else {
      extractCode(sourceFolder, file)
    }
  }
}

async function extractCode(filePath: string, file: string) {
  const outputPath = filePath.split('/').slice(2).join('/');

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  outputPath.split('/').slice(0, -1).reduce((acc, curr) => {
    const folder = acc + curr + '/'
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    return folder
  }, outputFolder)

  const raw = await fs.promises.readFile(filePath + file)
  const text = raw.toString('utf-8')

  const extractedCode = extractString(text)
  const isSuccess = extractedCode !== null
  const logMessage = `${new Date()} - ${file} - ${isSuccess ? 'Success' : 'Failed'}`

  console.log(logMessage)

  const finalOutputFolder = outputFolder + outputPath

  await fs.promises.appendFile(finalOutputFolder + `_log_${dateTimeString}.txt`, logMessage + '\n')
  if (isSuccess) {
    await fs.promises.writeFile(finalOutputFolder + file, extractedCode.trim())
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