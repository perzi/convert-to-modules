// Find declared globals from es5 source files

const _ = require('lodash')
const CLIEngine = require('eslint').CLIEngine
const escope = require('escope')
const esprima = require('esprima')
const fs = require('fs')
const path = require('path')
const program = require('commander')

const cli = new CLIEngine({
  useEslintrc: false,
  allowInlineConfig: false,
  rules: {
    'no-undef': 'error'
  }
})

program
  .version('0.1')
  .option('-g, --graph', 'Create expanded dotfile')
  .option('-m, --minigraph', 'Create mini dotfile')
  .option('-i, --info <namepattern>', 'Log something')
  .option('-c, --codemod', 'Create codemod file')
  .usage('[options] <file ...>')
  .parse(process.argv)

const [filesRoot = '', includeFiles = ''] = program.args

let canStart = true

// ensure files patterns given
if (filesRoot.length === 0) {
  console.error('No source root folder')
  canStart = false
}

if (includeFiles.length === 0) {
  console.error('No files folder')
  canStart = false
}

if (!canStart) {
  process.exit(1)
}

const report = cli.executeOnFiles([includeFiles])
const modulesRoot = path.resolve(filesRoot)

const reportWithGlobals = report.results.map(r => {
  let { source, filePath } = r
  if (!source) {
    source = r.source = fs.readFileSync(filePath, 'utf-8')
  }
  const globals = findGlobals(source)
  const undefVariables = getUndefinedVariables(r)
  const module = getModule(filePath)

  return {
    ...r,
    globals,
    undefVariables,
    module
  }
})

const globalMap = _.keyBy(
  _.flatten(
    reportWithGlobals.map(r => {
      const { filePath, globals, module } = r
      return globals.map(({name, type}) => ({
        filePath,
        name,
        module,
        type
      }))
    })
  ),
  'name'
)

const filePaths = _.uniq(report.results.map(r => r.filePath))
const modules = filePaths.map(filePath => ({
  filePath,
  ...getModule(filePath)
}))

if (program.graph || program.minigraph) {
  createDotFile(program.minigraph)
  process.exit(0)
}

if (program.info) {
  console.log(globalMap)

  logjson(reportWithGlobals.filter(r => r.filePath.includes(program.info)).map(({filePath, globals, undefVariables}) => ({
    filePath,
    globals,
    undefVariables
  })))

  process.exit(0)
}

if (program.codemod) {
  // output codemod file
  const mainTemplate = (data) => `
var data = ${JSON.stringify(data, null, 2)}

module.exports = function(fileInfo, api) {
  var path = fileInfo.path
  var source = fileInfo.source
  var transform = data[fileInfo.path]

  if (transform) {
    var j = api.jscodeshift
    var root = api.jscodeshift(source)
    var globals = transform.globals
    var imports = transform.imports
    var exports = transform.exports
    var body = root.get().node.program.body

    var getFirstNode = () => root.find(j.Program).get('body', 0).node
    var firstNode = getFirstNode()
    var { comments = [] } = firstNode
  
    var commentsWithoutGlobal = comments.filter(comment => {
      var isGlobalComment = comment &&
        comment.type === 'CommentBlock' &&
        comment.value
          .trim()
          .toLowerCase()
          .startsWith('global')
  
      return !isGlobalComment
    })
  
    firstNode.comments = commentsWithoutGlobal

    if (imports.length > 0) {
      body.unshift(imports)
    }

    if (globals.length > 0) {
      body.unshift(globals)
    }

    if (exports.length > 0) {
      body.push(exports)
    }

    return root.toSource()
  } else {
    return source
  }
}
`

  const sourceData = getCodeModData()
  const data = {}
  Object.keys(sourceData).forEach(filePath => {
    const item = sourceData[filePath]

    data[filePath] = {
      globals: item.globals.length ? `/* global ${item.globals.join(' ')} */` : '',
      imports: item.imports.map(i => `import {${i.variables.join(', ')}} from '${i.module}'`).join('\n'),
      exports: item.exports.length ? `export {${item.exports.join(', ')}}` : ''
    }
  })

  console.log(mainTemplate(data))
  process.exit(0)
}

function createDotFile (mini) {
  const createDotFileString = (clusters, connections) => `
digraph {
  rankdir = LR;
  graph [fontname = "helvetica"];
  node [fontname = "helvetica"];
  edge [fontname = "helvetica"];
  node [shape = box, style = "filled", color = "#cccccc"];

  ${clusters}

${connections}
}
`

  const createDotFileClusterString = (index, label, nodeNames) => `
  subgraph cluster_${index} {
    fillcolor = "#f0f0f0";
    style = "filled";
    pencolor = "transparent";

    label = "${label}";

    "${nodeNames.join('";\n    "')}";
  }
  `

  const createDotFileConnectionsString = (connections) => {
    return connections.map(({ from, to, label, type }) => {
      const labelString = label ? ` [label = "${label}"]` : ''
      const colorString = type !== 'FunctionName' ? '"#ff0000"' : '"#00ff00"'
      return `  "${from}" -> "${to}"${labelString}[color = ${colorString}];`
    }).join('\n')
  }

  const uniqueFolders = _.uniq(modules.map(m => m.relativeFromRoot))
  const clustersString = uniqueFolders.map((folder, index) => {
    const filesForFolder = reportWithGlobals.filter(r => r.module.relativeFromRoot === folder)

    const clusterInfo = filesForFolder.map(r => {
      const { module } = r
      const {name} = module
      return name
    })

    return createDotFileClusterString(index, folder, clusterInfo)
  }).join('\n')

  const connections = getConnections()

  if (mini) {
    const squishedConnectionsMap = {}
    connections.forEach(c => {
      const {from, to, label} = c
      const key = `${from}->${to}`

      // take first found item and count items
      if (!squishedConnectionsMap[key]) {
        if (label) {
          const count = connections.filter(c2 => c2.from === from && c2.to === to).length
          squishedConnectionsMap[key] = {
            from,
            to,
            label: count > 1 ? count : undefined
          }
        } else {
          squishedConnectionsMap[key] = {
            from,
            to
          }
        }
      }
    })
    const connectionKeys = Object.keys(squishedConnectionsMap)
    const squishedConnections = connectionKeys.map(k => squishedConnectionsMap[k])

    console.log(createDotFileString(clustersString, createDotFileConnectionsString(squishedConnections)))
  } else {
    console.log(createDotFileString(clustersString, createDotFileConnectionsString(connections)))
  }
}

function logjson (value) {
  console.log(JSON.stringify(value, null, 2))
}

function getUndefinedVariables (report) {
  const { messages } = report
  const uniqueMessages = _.uniqBy(messages, m => m.message)
  const noUndefMessages = uniqueMessages.filter(m => m.ruleId === 'no-undef')
  const undefVariables = noUndefMessages
    .map(m => {
      const { message } = m
      const [, variableName] = message.match(/^'([^']+)'/)
      return variableName
    })

  return undefVariables
}

function getModule (filePath) {
  const dirName = path.dirname(filePath)
  const relativeFromRoot = path.relative(modulesRoot, dirName)
  const relativeToModule = path.relative(dirName, modulesRoot)
  const name = path.basename(filePath, '.js')

  const module = {
    name,
    relativeFromRoot,
    module: path.join(relativeFromRoot, name),
    toRoot: relativeToModule
  }

  return module
}

// ref: https://ariya.io/2013/09/scope-analysis-for-javascript-code
function findGlobals (source) {
  const syntax = esprima.parse(source, { loc: true })
  const scopeManager = escope.analyze(syntax)

  const getValue = v => ({
    name: v.name,
    type: v.defs[0].type
  })

  const implicitVariables = scopeManager.globalScope.implicit.variables.map(getValue)
  const variables = scopeManager.globalScope.variables.map(getValue)
  const result = implicitVariables.concat(variables).sort()

  return result
}

function getConnections () {
  const connections = _.flatten(reportWithGlobals.map(r => {
    const { module, undefVariables } = r
    const from = module.name
    return undefVariables.map(variable => {
      const toModule = globalMap[variable]

      if (toModule) {
        return {
          from,
          to: toModule.module.name,
          label: variable,
          type: toModule.type
        }
      } else {
        return {
          from,
          to: variable
        }
      }
    }).filter(s => s !== null)
  }))

  return connections
}

function getCodeModData () {
  const dataByFile = reportWithGlobals.map(r => {
    const {undefVariables, globals, filePath} = r
    const sourceModule = r.module

    const globalVariables = _.sortBy(undefVariables.map(variable => {
      const toModule = globalMap[variable]

      if (!toModule) {
        return variable
      } else {
        return null
      }
    }).filter(s => s !== null),
    [o => o.to])

    const importsByModule = _.groupBy(undefVariables.map(variable => {
      const fromModuleInfo = globalMap[variable]

      if (fromModuleInfo) {
        const fromModule = fromModuleInfo.module
        const isInSameFolder = sourceModule.toRoot === fromModule.toRoot && sourceModule.relativeFromRoot === fromModule.relativeFromRoot
        const relativeModuleImport = isInSameFolder ? `./${fromModule.name}` : `${fromModule.toRoot}/${fromModule.relativeFromRoot}/${fromModule.name}`
        return {
          from: relativeModuleImport,
          name: variable
        }
      } else {
        return null
      }
    }).filter(s => s !== null), 'from')
    const imports = Object.keys(importsByModule).map(modulePath => {
      return {
        module: modulePath,
        variables: importsByModule[modulePath].map(i => i.name)
      }
    })

    const exports = globals.map(g => g.name).sort()

    return {
      filePath,
      data: {
        globals: globalVariables,
        imports,
        exports
      }
    }
  })

  const data = {}
  dataByFile.forEach(o => {
    data[o.filePath] = o.data
  })

  return data
}
