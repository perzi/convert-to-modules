# convert-to-modules

Tool to convert ES5 files to ES2015 modules.

If you have a bunch of JavaScript files which relies on global variables and files being included in a certain order, this tool can help you convert them ES2015 modules. It can also inspect and output a dot-file to render a dependency graph. 

## Why create a tool for this?

Because you can run the conversion over and over and do the actual conversion when it suits best. The project I was working on when creating this had a lot a files and there we things needed to be fixed before we could do the conversion. Converting the files and trying to bundle them we found many things we refactored before converting them. This tool helped to be able to do the conversion more than once and with the latest versions of all files.

## Other tools needed

[jscodeshift](https://github.com/facebook/jscodeshift) to do the conversion.

[Graphviz](http://graphviz.org) to convert graphs to images.

## Install

`npm install --save-dev convert-to-modules`

## CLI Usage

### Convert files

`npx convert-to-modules --codemod <rootfolder> "<filepattern>" > <codemod filename>`

rootfolder is a parent folder which all files will be relative to.

#### Example

##### Create codemod

`npx convert-to-modules --codemod scripts "scripts/**/*.js" > convert_scripts_codemod.js`

Note: Make sure to put the files pattern in a string for it to work. 

##### Run jscodeshift

`jscodeshift --transform convert_scripts_codemod.js <absolute root to files>/scripts/**/*.js`

Note: The codemod will have full paths to files in it. You must run it with the full path to the files. And you have to recreate a new codemod if you move the source files after creating a codemod. Any existing eslint inline comment `/* global */` will be replaced by the codemod. 

### Create dependency graph

`npx convert-to-modules --graph <rootfolder> <filepattern> > <dotfile>`

or

`npx convert-to-modules --minigraph <rootfolder>  <filepattern> > <dotfile>`

#### Example

##### Create graph

`npx convert-to-modules --graph scripts "scripts/**/*.js" > scripts_graph.dot`

##### Create png

`dot -Tpng -O scripts_graph.dot`

Will generate a file named `scripts_graph.dot.png`

See [Graphviz](http://graphviz.org) documentation for more options. 
