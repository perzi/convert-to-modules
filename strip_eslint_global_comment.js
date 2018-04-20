module.exports = function (file, api) {
  var j = api.jscodeshift
  var root = j(file.source)
  const getFirstNode = () => root.find(j.Program).get('body', 0).node

  const firstNode = getFirstNode()
  const { comments = [] } = firstNode
  const [first, ...rest] = comments

  if (first && first.type === 'CommentBlock') {
    if (
      first.value
        .trim()
        .toLowerCase()
        .startsWith('global')
    ) {
      firstNode.comments = rest
    }
  }

  return root.toSource()
}
