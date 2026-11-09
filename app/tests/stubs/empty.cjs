// A native module the tests never call (picking, sharing or saving files): just something to load.
module.exports = { File: class {}, Paths: {}, getDocumentAsync: async () => ({ canceled: true }), shareAsync: async () => {} };
