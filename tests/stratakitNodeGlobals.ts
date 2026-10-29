if (typeof globalThis.Node === 'undefined') {
  Object.defineProperty(globalThis, 'Node', {
    configurable: true,
    writable: true,
    value: class NodeTestGlobal {
      static readonly DOCUMENT_NODE = 9
    },
  })
}
