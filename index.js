const escope = require('escope')
const esprima = require('esprima')
const CLIEngine = require('eslint').CLIEngine
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const jscodeshift = require('jscodeshift')

// TODO: get from file/args
// SETTINGS
const externals = {
  $: 'jquery',
  jQuery: 'jquery',
  ko: 'knockout'
}

// TODO: get from cli as args
// TODO: do as prettier cli and write to std out
// TODO: and write with parameter --write
const filesRoot = 'source'
const includeFiles = `${filesRoot}/**/*.js`
const destinationRoot = 'dest'

//
// Program
//
const cli = new CLIEngine()
const report = cli.executeOnFiles([includeFiles])
const modulesRoot = path.resolve(process.cwd(), filesRoot)

const reportWithGlobals = report.results.map(r => {
  let { source } = r
  if (!source) {
    source = r.source = fs.readFileSync(r.filePath, 'utf-8')
  }
  const globals = findGlobals(source)
  return {
    ...r,
    globals
  }
})

const filePaths = _.uniq(report.results.map(r => r.filePath))
const modules = filePaths.map(filePath => ({
  filePath,
  ...getModule(filePath)
}))

const modulesByFilePath = _.keyBy(modules, 'filePath')

const globalMap = _.keyBy(
  _.flatten(
    reportWithGlobals.map(r => {
      const { filePath, globals } = r
      const module = getModule(filePath)

      return globals.map(name => ({
        filePath,
        name,
        module
      }))
    })
  ),
  'name'
)

const result = reportWithGlobals.map(r => {
  const { messages, source, globals, filePath } = r
  const uniqueMessages = _.uniqBy(messages, m => m.message)
  const noUndefMessages = uniqueMessages.filter(m => m.ruleId === 'no-undef')
  const undefVariables = noUndefMessages
    .map(m => {
      const { message } = m
      const [, variableName] = message.match(/^'([^']+)'/)
      return variableName
    })
    .filter(v => {
      const moduleWithGlobal = globalMap[v]

      if (moduleWithGlobal) {
        return moduleWithGlobal.filePath !== filePath
      } else {
        return true
      }
    })
    .sort()

  const fromModule = modulesByFilePath[filePath]
  const imports = undefVariables.map(v => {
    const moduleWithGlobal = globalMap[v]

    if (moduleWithGlobal) {
      const toModule = modulesByFilePath[moduleWithGlobal.filePath]
      const i = getImport(fromModule, toModule)
      return {
        name: moduleWithGlobal.name,
        module: i
      }
    } else if (externals[v]) {
      return {
        name: v,
        module: externals[v]
      }
    } else {
      return {
        name: v,
        module: v
      }
    }
  })

  const root = jscodeshift(source)
  const importsByModule = _.groupBy(imports, 'module')
  const importsString = _.keys(importsByModule)
    .map(module => {
      const names = importsByModule[module].map(m => m.name)
      return `import { ${names.join(', ')} } from '${module}'`
    })
    .join('\n')
  const exportsString = globals.map(name => `export { ${name} }`).join('\n')

  if (importsString.length > 0) {
    root.get().node.program.body.unshift(`${importsString}\n`)
  }

  if (exportsString.length > 0) {
    root.get().node.program.body.push(`\n${exportsString}`)
  }

  const newSource = root.toSource()

  const newFilePath = path.resolve(
    path.join(destinationRoot, path.relative(filesRoot, filePath))
  )

  return {
    source: newSource,
    filePath,
    newFilePath
  }
})

result.forEach(m => {
  fs.writeFileSync(m.newFilePath, m.source, 'utf-8')
})

logjson(result)

//
// Functions
//
function getImport (fromModule, toModule) {
  return (
    (fromModule.toRoot === '' ? './' : '') +
    path.join(fromModule.toRoot, toModule.module)
  )
}

function logjson (value) {
  console.log(JSON.stringify(value, null, 2))
}

function getModuleForGlobal (name, currentFilePath) {
  // TODO: compute relative to source root and make import
  // ${currentModuleRelativeToRoot}/${moduleName}
  // currentModuleRelativeToRoot = ../.. for currentModule
  // moduleName = base/the_module

  const { filePath, moduleName } = globalMap[name]
  // const relativePath = path.relative(path.dirname(filePath), path.dirname(currentFilePath))
  // const importName = path.join(relativePath, path.basename(filePath, ))

  return {
    name
  }
}

function getModule (filePath) {
  const dirName = path.dirname(filePath)
  const relativeToRoot = path.relative(modulesRoot, dirName)
  const relativeToModule = path.relative(dirName, modulesRoot)
  const module = {
    module: path.join(relativeToRoot, path.basename(filePath, '.js')),
    toRoot: relativeToModule
  }

  return module
}

// ref: https://ariya.io/2013/09/scope-analysis-for-javascript-code
function findGlobals (source) {
  const syntax = esprima.parse(source, { loc: true })
  const globalScope = escope.analyze(syntax)
  const implicitVariables = _.flatten(
    globalScope.globalScope.implicit.variables.map(v =>
      v.identifiers.map(id => id.name)
    )
  )
  const variables = globalScope.globalScope.variables.map(v => v.name)
  const result = implicitVariables.concat(variables).sort()

  return result
}
