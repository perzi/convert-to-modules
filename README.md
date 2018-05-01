# convert-to-modules

Tool to convert ES5 files to ES2015 modules.

If you have a bunch of JavaScript files which relies on global variables and files being included in a certain order, this tool can help you inspect and create a codemod to convert the files to ES2015 modules. It can also inspect and output a dot-file to render a dependency graph.

Install [jscodeshift](https://github.com/facebook/jscodeshift) to do the conversion.

Install [Graphviz](http://graphviz.org) to convert graphs to images.

## Install

`npm install --save-dev`

## CLI Usage

### Convert files

`npx convert-to-modules --codemod <files> > <codemod filename>`

ESLint is used internally to find globals and your files can't have any eslint comment like `/* global myglobal */` when running it. Remove them before running with `--codemod` option. There's a codemod for that `strip_eslint_global_comment.js` in the root of this project. 

#### Example

##### Create codemod
`npx convert-to-modules --codemod ./scripts/**/*.js > convert_scripts_codemod.js`

##### Run jscodeshift

`jscodeshift ./scripts/**/*.js --transform convert_scripts_codemod.js`

Note: The codemod will have full paths to files in it. The source files can't change path after codemod creation.

### Create dependency graph

`npx convert-to-modules --graph <files> > <dotfile>`

or

`npx convert-to-modules --minigraph <files> > <dotfile>`

#### Example

##### Create graph
`npx convert-to-modules --graph ./scripts/**/*.js > scripts_graph.dot`

##### Create png

`dot -Tpng -O scripts_graph.dot`

Will generate a file named `scripts_graph.dot.png`







